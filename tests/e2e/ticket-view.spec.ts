import { expect, test } from '@playwright/test';
import { api, card, createProject, createTicket, getTicket, open, reload } from './helpers';

test('langer Titel bricht um statt abgeschnitten zu werden', async ({ page, request }) => {
	const p = await createProject(request);
	const long =
		'Back wenn ich in ein Unterticket bin, will ich mit der Zurück-Taste der Maus wieder ins übergeordnete Ticket kommen';
	const t = await createTicket(request, p.key, { title: long });

	await open(page, `/tickets/${t.key}`);
	const title = page.getByRole('textbox', { name: 'Titel', exact: true });
	await expect(title).toHaveValue(long);
	// Mehrere Zeilen hoch, nichts horizontal versteckt
	const size = await title.evaluate((el) => ({
		height: el.clientHeight,
		lineHeight: parseFloat(getComputedStyle(el).lineHeight),
		hiddenX: el.scrollWidth - el.clientWidth,
		hiddenY: el.scrollHeight - el.clientHeight
	}));
	expect(size.height).toBeGreaterThan(size.lineHeight * 1.5);
	expect(size.hiddenX).toBeLessThanOrEqual(0);
	expect(size.hiddenY).toBeLessThanOrEqual(1);

	// Enter speichert und fügt keinen Zeilenumbruch ein
	await title.fill('Kurz');
	await title.press('Enter');
	await expect.poll(async () => (await getTicket(request, t.key)).title).toBe('Kurz');
	await expect(title).toHaveValue('Kurz');
});

test('Zurück-Taste führt aus der Unteraufgabe ins übergeordnete Ticket', async ({ page, request }) => {
	const p = await createProject(request);
	const parent = await createTicket(request, p.key, { title: 'Release vorbereiten' });
	const child = await createTicket(request, p.key, { title: 'Changelog schreiben', parent: parent.key });

	await open(page, `/projects/${p.key}/board`);
	await card(page, 'Release vorbereiten').getByRole('link', { name: 'Release vorbereiten' }).click();
	const modal = page.getByRole('dialog');
	await expect(modal.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue('Release vorbereiten');

	await modal.getByRole('link', { name: /Changelog schreiben/ }).click();
	await expect(page).toHaveURL(`/tickets/${child.key}`);
	await expect(modal.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue('Changelog schreiben');

	// Maus-/Browser-Zurück: wieder das übergeordnete Ticket im Modal
	await page.goBack();
	await expect(page).toHaveURL(`/tickets/${parent.key}`);
	await expect(modal.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue('Release vorbereiten');

	// Vorwärts und über die Brotkrume zurück zum Elternticket
	await page.goForward();
	await expect(modal.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue('Changelog schreiben');
	await modal.getByRole('link', { name: parent.key, exact: true }).click();
	await expect(modal.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue('Release vorbereiten');

	// Schließen führt direkt zum Board, egal wie tief man geklickt hat
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
	await expect(page).toHaveURL(`/projects/${p.key}/board`);
});

test('Beschreibung ist direkt beschreibbar und speichert beim Verlassen', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Direkt schreiben' });

	await open(page, `/tickets/${t.key}`);
	const description = page.getByRole('textbox', { name: 'Beschreibung', exact: true });
	await expect(description).toHaveAttribute('placeholder', 'Beschreibung hinzufügen …');
	await description.click();
	await description.fill('Erste Zeile\nZweite Zeile');
	await page.getByRole('textbox', { name: 'Titel', exact: true }).click();
	await expect.poll(async () => (await getTicket(request, t.key)).description).toBe('Erste Zeile\nZweite Zeile');

	// Strg+Enter speichert ebenfalls
	await description.fill('Mit Tastenkürzel');
	await description.press('Control+Enter');
	await expect.poll(async () => (await getTicket(request, t.key)).description).toBe('Mit Tastenkürzel');

	// Esc verwirft den Entwurf
	await description.fill('Wird verworfen');
	await description.press('Escape');
	await expect(description).toHaveValue('Mit Tastenkürzel');
	await reload(page);
	await expect(description).toHaveValue('Mit Tastenkürzel');
});

test('Esc in der Beschreibung verwirft erst den Entwurf, dann schließt es das Modal', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Im Modal schreiben', description: 'Alt' });

	await open(page, `/projects/${p.key}/board`);
	await card(page, 'Im Modal schreiben').getByRole('link', { name: 'Im Modal schreiben' }).click();
	const modal = page.getByRole('dialog');
	const description = modal.getByRole('textbox', { name: 'Beschreibung', exact: true });
	await description.fill('Entwurf');
	await description.press('Escape');
	await expect(modal).toBeVisible();
	await expect(description).toHaveValue('Alt');
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
});

test('Verknüpfungen stehen in der Seitenleiste', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Seitenleiste' });

	await open(page, `/tickets/${t.key}`);
	const box = async (name: string) =>
		(await page.locator('[data-slot="card"]').filter({ hasText: name }).last().boundingBox())!;
	const links = await box('Verknüpfungen');
	const sidebar = (await page
		.locator('[data-slot="card"]')
		.filter({ has: page.getByRole('button', { name: 'Abschließen' }) })
		.boundingBox())!;
	const description = await box('Beschreibung');
	expect(Math.abs(links.x - sidebar.x)).toBeLessThan(1);
	expect(links.y).toBeGreaterThan(sidebar.y + sidebar.height - 1);
	expect(links.x).toBeGreaterThan(description.x + description.width);
});

test('Unteraufgaben mit offener Voraussetzung sind markiert', async ({ page, request }) => {
	const p = await createProject(request);
	const blocker = await createTicket(request, p.key, { title: 'Server bestellen' });
	const parent = await createTicket(request, p.key, { title: 'Umzug ins Rechenzentrum' });
	await createTicket(request, p.key, { title: 'Daten kopieren', parent: parent.key, dependsOn: [blocker.key] });
	await createTicket(request, p.key, { title: 'Kabel beschriften', parent: parent.key });

	await open(page, `/tickets/${parent.key}`);
	const item = (title: string) => page.getByRole('listitem').filter({ hasText: title });
	await expect(item('Daten kopieren').locator('[data-blocked]')).toHaveText('1');
	await expect(item('Kabel beschriften').locator('[data-blocked]')).toHaveCount(0);

	// Auch auf der Board-Karte: zugeklappt als Zähler, aufgeklappt an der Unteraufgabe
	await open(page, `/projects/${p.key}/board`);
	const c = card(page, 'Umzug ins Rechenzentrum');
	await expect(c.locator('[data-blocked-subtasks]')).toContainText('1');
	await c.getByRole('button', { name: /Unteraufgaben/ }).click();
	await expect(c.getByRole('link', { name: /Daten kopieren/ }).locator('[data-blocked]')).toBeVisible();
	await expect(c.getByRole('link', { name: /Kabel beschriften/ }).locator('[data-blocked]')).toHaveCount(0);

	await api(request, 'POST', `/tickets/${blocker.key}/close`);
	await expect(c.locator('[data-blocked-subtasks]')).toHaveCount(0);
});

test('schnell hintereinander angelegte Unteraufgaben gehen nicht verloren', async ({ page, request }) => {
	const p = await createProject(request);
	const parent = await createTicket(request, p.key, { title: 'Viele Schritte' });

	await open(page, `/tickets/${parent.key}`);
	const input = page.getByPlaceholder('Neue Unteraufgabe');
	const titles = ['Schritt 1', 'Schritt 2', 'Schritt 3', 'Schritt 4'];
	for (const title of titles) {
		await input.fill(title);
		await input.press('Enter');
	}
	await expect(input).toHaveValue('');
	await expect
		.poll(async () => (await getTicket(request, parent.key)).subtasks.map((s: { title: string }) => s.title))
		.toEqual(titles);
	for (const title of titles) await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
});
