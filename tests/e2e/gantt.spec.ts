import { expect, test, type Page } from '@playwright/test';
import { api, card, createProject, createTicket as createRawTicket, day, getTicket, open, reload } from './helpers';

const createTicket = (request: Parameters<typeof createRawTicket>[0], projectKey: string, data: Record<string, unknown>) =>
	createRawTicket(request, projectKey, { kind: 'main', ...data });

/** Ticketzeile in der Liste links */
const row = (page: Page, title: string) => page.locator('.labels .label').filter({ hasText: title });

test('Gantt legt zuerst eine Version und darunter eine Hauptaufgabe an', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/gantt`);
	await page.getByRole('button', { name: 'Version', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Titel').fill('Version 2');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	const [version] = await api<{ id: number; key: string; kind: string; parentId: number | null }[]>(
		request, 'GET', `/projects/${p.key}/tickets`
	);
	expect(version).toMatchObject({ kind: 'version', parentId: null });
	await row(page, 'Version 2').hover();
	await row(page, 'Version 2').getByRole('button', { name: 'Hauptaufgabe zu Version 2 hinzufügen' }).click();
	await dialog.getByLabel('Titel').fill('Hauptaufgabe B');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	const main = (await api<{ key: string; kind: string; parentId: number | null }[]>(
		request, 'GET', `/projects/${p.key}/tickets`
	)).find((t) => t.kind === 'main');
	expect(main).toMatchObject({ parentId: version.id });
	await row(page, 'Version 2').getByRole('button', { name: /Unteraufgaben aufklappen/ }).click();
	await expect(row(page, 'Hauptaufgabe B')).toBeVisible();
});

test('Version und Hauptaufgabe im Gantt, nur Tasks im Kanban', async ({ page, request }) => {
	const p = await createProject(request);
	const version = await createTicket(request, p.key, { title: 'Version 1', kind: 'version', startDate: day(0), dueDate: day(10) });
	const main = await createTicket(request, p.key, { title: 'Hauptaufgabe A', kind: 'main', parentId: version.id, startDate: day(1), dueDate: day(5) });
	await createTicket(request, p.key, { title: 'Task A', kind: 'task', parentId: main.id, startDate: day(2), dueDate: day(3) });
	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Version 1')).toBeVisible();
	await row(page, 'Version 1').getByRole('button', { name: /Unteraufgaben aufklappen/ }).click();
	await expect(row(page, 'Hauptaufgabe A')).toBeVisible();
	await expect(row(page, 'Task A')).toHaveCount(0);
	await open(page, `/projects/${p.key}/board`);
	await expect(page.getByRole('button', { name: /Hauptaufgabe A/ })).toBeVisible();
	await expect(card(page, 'Task A')).toBeVisible();
	await expect(card(page, 'Hauptaufgabe A')).toHaveCount(0);
});

test('Backlog-Ticket im Gantt einplanen und wieder in den Backlog legen', async ({ page, request }) => {
	const p = await createProject(request);
	await api(request, 'POST', `/projects/${p.key}/columns`, { name: 'Backlog', isBacklog: true });
	const t = await createTicket(request, p.key, { title: 'Export als CSV', column: 'Backlog' });
	await createTicket(request, p.key, { title: 'Schon geplant', startDate: day(0), dueDate: day(3) });

	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Schon geplant')).toBeVisible();
	// Backlog ist standardmäßig ausgeblendet
	await expect(row(page, 'Export als CSV')).toHaveCount(0);

	await page.getByRole('button', { name: 'Hauptaufgabe einplanen…' }).click();
	// Bereits eingeplante Tickets stehen nicht in der Suche
	await expect(page.getByRole('option', { name: /Schon geplant/ })).toHaveCount(0);
	await page.getByPlaceholder('Hauptaufgabe suchen oder anlegen…').fill('CSV');
	await page.getByRole('option', { name: /Export als CSV.*Backlog/ }).click();

	await expect(row(page, 'Export als CSV')).toBeVisible();
	let detail = await getTicket(request, t.key);
	expect(detail).toMatchObject({ status: 'Offen', startDate: day(0), dueDate: day(2) });

	// Über das ✕ an der Zeile zurück in den Backlog
	await row(page, 'Export als CSV').hover();
	await page.getByRole('button', { name: `${t.key} aus dem Zeitplan nehmen` }).click();
	await page.getByRole('menuitem', { name: 'Zurück in den Backlog' }).click();
	await expect(row(page, 'Export als CSV')).toHaveCount(0);

	detail = await getTicket(request, t.key);
	expect(detail).toMatchObject({ status: 'Backlog', startDate: null, dueDate: null });
});

test('Termin entfernen blendet das Ticket aus, „Ohne Termin anzeigen“ zeigt es wieder', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Newsletter', startDate: day(1), dueDate: day(4) });

	await open(page, `/projects/${p.key}/gantt`);
	await row(page, 'Newsletter').hover();
	await page.getByRole('button', { name: `${t.key} aus dem Zeitplan nehmen` }).click();
	await page.getByRole('menuitem', { name: 'Aus dem Zeitplan entfernen' }).click();
	await expect(row(page, 'Newsletter')).toHaveCount(0);
	expect((await getTicket(request, t.key)).startDate).toBeNull();

	await page.getByLabel(/Ohne Termin anzeigen/).check();
	await expect(row(page, 'Newsletter')).toBeVisible();
});

test('neues Ticket direkt aus der Einplanen-Suche anlegen', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/gantt`);

	await page.getByRole('button', { name: 'Hauptaufgabe einplanen…' }).click();
	await page.getByPlaceholder('Hauptaufgabe suchen oder anlegen…').fill('Messestand planen');
	await page.getByRole('option', { name: '„Messestand planen“ als neue Hauptaufgabe anlegen' }).click();

	await expect(row(page, 'Messestand planen')).toBeVisible();
	const [t] = await api<{ title: string; kind: string; parentId: number | null; startDate: string }[]>(request, 'GET', `/projects/${p.key}/tickets`);
	expect(t).toMatchObject({ title: 'Messestand planen', kind: 'main', parentId: null, startDate: day(0) });
});

test('Unteraufgaben im Gantt auf- und zuklappen', async ({ page, request }) => {
	const p = await createProject(request);
	const parent = await createTicket(request, p.key, { title: 'Umzug', kind: 'version', startDate: day(0), dueDate: day(10) });
	await createTicket(request, p.key, {
		title: 'Kisten packen',
		parent: parent.key,
		startDate: day(1),
		dueDate: day(2)
	});

	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Kisten packen')).toHaveCount(0);

	await row(page, 'Umzug')
		.getByRole('button', { name: /Unteraufgaben aufklappen/ })
		.click();
	await expect(row(page, 'Kisten packen')).toBeVisible();

	// Aufgeklappt bleibt aufgeklappt, auch nach Neuladen und auf dem Board-Zeitplan
	await reload(page);
	await expect(row(page, 'Kisten packen')).toBeVisible();
	await open(page, `/projects/${p.key}/board`);
	await expect(row(page, 'Kisten packen')).toBeVisible();
	await open(page, `/projects/${p.key}/gantt`);

	await row(page, 'Umzug')
		.getByRole('button', { name: /Unteraufgaben zuklappen/ })
		.click();
	await expect(row(page, 'Kisten packen')).toHaveCount(0);
	await reload(page);
	await expect(row(page, 'Umzug')).toBeVisible();
	await expect(row(page, 'Kisten packen')).toHaveCount(0);
});

test('Gantt passt ohne horizontale Scrollleiste, wenn alle Termine hineinpassen', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Kurz', startDate: day(0), dueDate: day(2) });

	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Kurz')).toBeVisible();
	const overflow = await page.locator('.gantt').evaluate((el) => el.scrollWidth - el.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('nach dem Einplanen bleibt „Ticket einplanen…“ sichtbar, auch bei vielen Tickets', async ({ page, request }) => {
	const p = await createProject(request);
	// Mehr Zeilen, als in den Zeitplan über dem Board passen (max. 360 px)
	for (let i = 0; i < 14; i++)
		await createTicket(request, p.key, { title: `Geplant ${i}`, startDate: day(i), dueDate: day(i + 1) });
	for (const title of ['Offen A', 'Offen B', 'Offen C']) await createTicket(request, p.key, { title });

	await open(page, `/projects/${p.key}/board`);
	const button = page.getByRole('button', { name: 'Hauptaufgabe einplanen…' });
	await button.scrollIntoViewIfNeeded();

	for (const title of ['Offen A', 'Offen B', 'Offen C']) {
		await button.click();
		await page.getByRole('option', { name: new RegExp(title) }).click();
		await expect(row(page, title)).toBeVisible();
		await expect(button).toBeInViewport({ ratio: 1 });
	}

	// Auch beim Anlegen eines neuen Tickets aus der Suche
	await button.click();
	await page.getByPlaceholder('Hauptaufgabe suchen oder anlegen…').fill('Ganz neu');
	await page.getByRole('option', { name: '„Ganz neu“ als neue Hauptaufgabe anlegen' }).click();
	await expect(row(page, 'Ganz neu')).toBeVisible();
	await expect(button).toBeInViewport({ ratio: 1 });
});

test('Zeitplan über dem Board in der Höhe ziehen, Höhe bleibt gespeichert', async ({ page, request }) => {
	const p = await createProject(request);
	for (let i = 0; i < 20; i++)
		await createTicket(request, p.key, { title: `Aufgabe ${i}`, startDate: day(i), dueDate: day(i + 1) });

	await open(page, `/projects/${p.key}/board`);
	const gantt = page.locator('.gantt');
	const handle = page.getByRole('separator', { name: 'Höhe des Zeitplans ändern' });
	const before = (await gantt.boundingBox())!.height;
	expect(before).toBeCloseTo(360, -1);

	// Griff 200 px nach unten ziehen
	const box = (await handle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 200, { steps: 5 });
	await page.mouse.up();
	await expect.poll(async () => (await gantt.boundingBox())!.height).toBeCloseTo(before + 200, -1);

	// Nach Neuladen gleiche Höhe
	await reload(page);
	await expect.poll(async () => (await page.locator('.gantt').boundingBox())!.height).toBeCloseTo(before + 200, -1);

	// Tastatur und Doppelklick
	await handle.focus();
	await page.keyboard.press('ArrowUp');
	await expect.poll(async () => (await gantt.boundingBox())!.height).toBeCloseTo(before + 180, -1);
	await handle.dblclick();
	await expect.poll(async () => (await gantt.boundingBox())!.height).toBeCloseTo(360, -1);
});

test('deadline-only tickets stay out of the schedule while start-only tickets remain visible', async ({
	page,
	request
}) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Deadline only', dueDate: day(5) });
	await createTicket(request, p.key, { title: 'Start only', startDate: day(1) });
	await createTicket(request, p.key, { title: 'Planned interval', startDate: day(1), dueDate: day(3) });
	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Deadline only')).toHaveCount(0);
	await expect(row(page, 'Start only')).toBeVisible();
	await expect(row(page, 'Planned interval')).toBeVisible();
	await open(page, `/projects/${p.key}/board`);
	await expect(page.getByRole('button', { name: 'Zeitplan 2 eingeplant', exact: true })).toBeVisible();
});

test('planning deadline-only tickets preserves the original due date', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Keep this deadline', dueDate: day(8) });
	await open(page, `/projects/${p.key}/gantt`);
	await page.getByRole('button', { name: 'Hauptaufgabe einplanen…' }).click();
	await page.getByRole('option', { name: /Keep this deadline/ }).click();
	await expect(row(page, t.title)).toBeVisible();
	expect(await getTicket(request, t.key)).toMatchObject({ startDate: day(0), dueDate: day(8) });

	const other = await createTicket(request, p.key, { title: 'Plan with the shortcut', dueDate: day(6) });
	await open(page, `/tickets/${other.key}`);
	await page.getByRole('button', { name: 'Ab heute planen', exact: true }).click();
	await expect.poll(async () => (await getTicket(request, other.key)).startDate).toBe(day(0));
	expect((await getTicket(request, other.key)).dueDate).toBe(day(6));
	await expect(page.getByRole('button', { name: 'Ab heute planen', exact: true })).toHaveCount(0);
});

test('overdue deadlines are not silently moved when scheduling from today', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Past deadline', dueDate: day(-1) });
	await open(page, `/tickets/${t.key}`);
	await expect(page.getByRole('button', { name: 'Ab heute planen', exact: true })).toBeDisabled();
	await open(page, `/projects/${p.key}/gantt`);
	await page.getByRole('button', { name: 'Hauptaufgabe einplanen…' }).click();
	await page.getByRole('option', { name: /Past deadline/ }).click();
	await expect(page.getByText('Das Startdatum darf nicht nach der Fälligkeit liegen.', { exact: true })).toBeVisible();
	expect(await getTicket(request, t.key)).toMatchObject({ startDate: null, dueDate: day(-1) });
	await expect(row(page, t.title)).toHaveCount(0);
});
