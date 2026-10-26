import { expect, test, type Browser, type Page } from '@playwright/test';
import { api, createProject, getTicket, open } from './helpers';

type Mode = 'Ausgeblendet' | 'Optional' | 'Pflichtfeld';
type FormOptions = {
	projects: string[];
	requireLogin?: boolean;
	email?: Mode;
	design?: 'Standard' | 'Enable';
	/** Feldbezeichnung → Modus, z.B. { Priorität: 'Pflichtfeld' } */
	fields?: Record<string, Mode>;
	/** Nur diese Tags erlauben */
	allowedTags?: string[];
};

/** Formular über die Einstellungsseite anlegen und den Link zurückgeben */
async function createIntakeForm(page: Page, name: string, options: FormOptions) {
	await open(page, '/settings/forms');
	await page.getByRole('button', { name: 'Neues Formular' }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Name').fill(name);
	for (const project of options.projects) await dialog.getByRole('checkbox', { name: project }).click();
	if (options.requireLogin) await dialog.getByRole('checkbox', { name: 'Anmeldung erforderlich' }).click();
	const choose = async (select: string, option: string) => {
		await dialog.getByRole('button', { name: select, exact: true }).click();
		await page.getByRole('option', { name: option, exact: true }).click();
	};
	if (options.email) await choose('E-Mail-Feld', options.email);
	if (options.design) await choose('Design', options.design);
	for (const [field, mode] of Object.entries(options.fields ?? {})) await choose(field, mode);
	if (options.allowedTags) {
		await dialog.getByRole('checkbox', { name: 'Nur ausgewählte Tags erlauben' }).click();
		for (const tag of options.allowedTags) await dialog.getByRole('checkbox', { name: tag, exact: true }).click();
	}
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog).toBeHidden();
	return card(page, name).getByRole('textbox', { name: 'Link kopieren' }).inputValue();
}

const card = (page: Page, name: string) => page.locator('[data-slot="card"]').filter({ hasText: name });

/** Neuer Browser-Kontext ohne Anmeldung */
async function anonymous(browser: Browser, baseURL: string | undefined) {
	const context = await browser.newContext({ baseURL, locale: 'de-DE', storageState: { cookies: [], origins: [] } });
	return context.newPage();
}

test('Formular mit mehreren Projekten: Projekt beim Einreichen wählen', async ({ page, browser, baseURL, request }) => {
	const a = await createProject(request, 'Web');
	const b = await createProject(request, 'App');
	const link = await createIntakeForm(page, `Alle ${a.key}`, {
		projects: [`Web ${a.key}`, `App ${b.key}`],
		email: 'Ausgeblendet'
	});

	const guest = await anonymous(browser, baseURL);
	await guest.goto(link);
	await expect(guest.getByLabel(/Deine E-Mail-Adresse/)).toHaveCount(0);
	await guest.getByLabel('Titel').fill('Absturz in der App');
	await guest.getByRole('button', { name: 'Einreichen' }).click();
	await expect(guest.getByRole('alert')).toContainText('Bitte ein Projekt auswählen.');

	await guest.getByRole('button').filter({ hasText: 'Projekt wählen…' }).click();
	await guest.getByRole('option', { name: `App ${b.key}` }).click();
	await guest.getByRole('button', { name: 'Einreichen' }).click();
	await expect(guest.getByRole('status')).toContainText(`${b.key}-1`);
	expect((await getTicket(request, `${b.key}-1`)).title).toBe('Absturz in der App');
});

test('Enable-Design zeigt Logo und Formular und erstellt Tickets', async ({ page, browser, baseURL, request }) => {
	const p = await createProject(request, 'Enable');
	const link = await createIntakeForm(page, `Fehler ${p.key}`, {
		projects: [`Enable ${p.key}`],
		design: 'Enable'
	});
	const guest = await anonymous(browser, baseURL);
	await guest.goto(link);
	await expect(
		guest.locator('[data-design="enable"] img[src="/brands/ecomplete_software_icon.png"]').first()
	).toBeVisible();
	await expect(guest.getByRole('heading', { name: `Fehler ${p.key}` })).toBeVisible();
	await guest.getByLabel('Titel').fill('Fehler beim Laden');
	await guest.getByRole('button', { name: 'Einreichen' }).click();
	await expect(guest.getByRole('status')).toContainText(`${p.key}-1`);
	expect((await getTicket(request, `${p.key}-1`)).title).toBe('Fehler beim Laden');
});

test('Neu erzeugter Link und deaktiviertes Formular sperren alte Aufrufe', async ({
	page,
	browser,
	baseURL,
	request
}) => {
	const p = await createProject(request, 'Sperre');
	const name = `Sperre ${p.key}`;
	const oldLink = await createIntakeForm(page, name, { projects: [`Sperre ${p.key}`] });

	await card(page, name).getByRole('button', { name: 'Neuen Link erzeugen' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Neuen Link erzeugen' }).click();
	await expect(card(page, name).getByRole('textbox', { name: 'Link kopieren' })).not.toHaveValue(oldLink);
	const newLink = await card(page, name).getByRole('textbox', { name: 'Link kopieren' }).inputValue();

	const guest = await anonymous(browser, baseURL);
	expect((await guest.goto(oldLink))?.status()).toBe(404);
	expect((await guest.goto(newLink))?.status()).toBe(200);

	await card(page, name).getByRole('button', { name: 'Bearbeiten' }).click();
	await page.getByRole('dialog').getByRole('checkbox', { name: 'Aktiv' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
	await expect(card(page, name)).toContainText('Deaktiviert');
	expect((await guest.goto(newLink))?.status()).toBe(404);
});

test('Einreichungsseite: Karte mittig, Primärfarbe vom gewählten Projekt', async ({
	page,
	browser,
	baseURL,
	request
}) => {
	const a = await createProject(request, 'Rot');
	const b = await createProject(request, 'Grün');
	await api(request, 'PATCH', `/projects/${a.key}`, { color: '#dc2626' });
	await api(request, 'PATCH', `/projects/${b.key}`, { color: '#15803d' });
	const link = await createIntakeForm(page, `Farben ${a.key}`, { projects: [`Rot ${a.key}`, `Grün ${b.key}`] });

	const guest = await anonymous(browser, baseURL);
	await guest.setViewportSize({ width: 1280, height: 1000 });
	await guest.goto(link);
	const box = (await guest.locator('[data-slot="card"]').boundingBox())!;
	expect(Math.abs(box.y + box.height / 2 - 500)).toBeLessThan(4);

	const submit = guest.getByRole('button', { name: 'Einreichen' });
	await guest.getByRole('button').filter({ hasText: 'Projekt wählen…' }).click();
	await guest.getByRole('option', { name: `Rot ${a.key}` }).click();
	await expect(submit).toHaveCSS('background-color', 'rgb(220, 38, 38)');
	await guest
		.getByRole('button')
		.filter({ hasText: `Rot ${a.key}` })
		.click();
	await guest.getByRole('option', { name: `Grün ${b.key}` }).click();
	await expect(submit).toHaveCSS('background-color', 'rgb(21, 128, 61)');
});

test('Einbettungscode: Formular auf einer fremden Seite einreichen, App selbst nicht einbettbar', async ({
	page,
	browser,
	baseURL,
	request
}) => {
	const p = await createProject(request, 'Einbetten');
	const name = `Eingebettet ${p.key}`;
	await createIntakeForm(page, name, { projects: [`Einbetten ${p.key}`], email: 'Ausgeblendet' });

	await card(page, name).getByRole('button', { name: 'Einbetten' }).click();
	const code = await page.getByRole('dialog').getByRole('textbox', { name: 'Einbettungscode' }).inputValue();
	expect(code).toContain('?embed');

	// Nur die Formularseite darf in fremden Seiten erscheinen
	const app = await request.get('/settings/forms');
	expect(app.headers()['x-frame-options']).toBe('DENY');
	expect(app.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
	const formPage = await request.get(new URL(code.match(/src="([^"]+)"/)![1]).pathname);
	expect(formPage.headers()['x-frame-options']).toBeUndefined();

	// Fremde Webseite mit dem kopierten Code
	const host = await anonymous(browser, baseURL);
	await host.setContent(`<!doctype html><html><body><h1>Meine Seite</h1>${code}</body></html>`);
	const iframe = host.locator('iframe');
	const frame = host.frameLocator('iframe');
	await expect(frame.getByRole('heading', { name })).toBeVisible();
	// Höhe passt sich dem Inhalt an (Standard ohne Skript: 640 px)
	await expect.poll(async () => (await iframe.boundingBox())?.height).not.toBe(640);

	await frame.getByLabel('Titel').fill('Von der Webseite');
	await frame.getByRole('button', { name: 'Einreichen' }).click();
	await expect(frame.getByRole('status')).toContainText(`${p.key}-1`);
	expect((await getTicket(request, `${p.key}-1`)).title).toBe('Von der Webseite');
});

test('Statusantwort im Browser behält den Origin und verbirgt den privaten Link im Referer', async ({
	page,
	browser,
	baseURL,
	request
}) => {
	const p = await createProject(request, 'Statusantwort');
	const link = await createIntakeForm(page, `Status ${p.key}`, { projects: [`Statusantwort ${p.key}`] });
	const context = await browser.newContext({ baseURL, locale: 'de-DE', storageState: { cookies: [], origins: [] } });
	try {
		const guest = await context.newPage();
		await open(guest, link);
		await guest.getByLabel('Titel').fill('Rückfrage zum Ticket');
		await guest.getByRole('button', { name: 'Einreichen' }).click();
		await expect(guest.getByRole('status')).toContainText(`${p.key}-1`);
		await guest.getByRole('link', { name: 'Meine Tickets' }).click();
		await guest.locator(`a[href*="/status/${p.key}-1/"]`).click();
		await guest.locator('textarea[name="body"]').fill('Ergänzung vom Einreicher');
		const sent = guest.waitForRequest((r) => r.method() === 'POST' && r.url().includes(`/status/${p.key}-1/`));
		const response = guest.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes(`/status/${p.key}-1/`)
		);
		await guest.locator('button[type="submit"]').click();
		const submitted = await sent;
		const origin = new URL(baseURL!).origin;
		expect(submitted.headers().origin).toBe(origin);
		expect(submitted.headers().referer).toBe(`${origin}/`);
		expect((await response).status()).toBe(200);
		await expect(guest.getByRole('article').filter({ hasText: 'Ergänzung vom Einreicher' })).toBeVisible();
		await guest.goto(guest.url());
		await expect(guest.getByRole('article').filter({ hasText: 'Ergänzung vom Einreicher' })).toBeVisible();
	} finally {
		await context.close();
	}
});
