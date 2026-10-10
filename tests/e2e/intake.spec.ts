import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject, getTicket, open } from './helpers';

type Mode = 'Ausgeblendet' | 'Optional' | 'Pflichtfeld';
type FormOptions = {
	projects: string[];
	requireLogin?: boolean;
	email?: Mode;
	/** Feldbezeichnung → Modus, z.B. { Priorität: 'Pflichtfeld' } */
	fields?: Record<string, Mode>;
};

/** Formular über die Einstellungsseite anlegen und den Link zurückgeben */
async function createIntakeForm(page: Page, name: string, options: FormOptions) {
	await open(page, '/settings/forms');
	await page.getByRole('button', { name: 'Neues Formular' }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Name').fill(name);
	for (const project of options.projects) await dialog.getByRole('checkbox', { name: project }).click();
	if (options.requireLogin) await dialog.getByRole('checkbox', { name: 'Anmeldung erforderlich' }).click();
	const choose = async (select: string, mode: Mode) => {
		await dialog.getByRole('button', { name: select, exact: true }).click();
		await page.getByRole('option', { name: mode, exact: true }).click();
	};
	if (options.email) await choose('E-Mail-Feld', options.email);
	for (const [field, mode] of Object.entries(options.fields ?? {})) await choose(field, mode);
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

test('Öffentliches Formular: Ticket ohne Anmeldung einreichen, E-Mail ist Pflicht', async ({
	page,
	browser,
	baseURL,
	request
}) => {
	const p = await createProject(request, 'Support');
	const link = await createIntakeForm(page, `Kundenanfragen ${p.key}`, {
		projects: [`Support ${p.key}`],
		email: 'Pflichtfeld'
	});

	const guest = await anonymous(browser, baseURL);
	await guest.goto(link);
	await expect(guest.getByRole('heading', { name: `Kundenanfragen ${p.key}` })).toBeVisible();
	// Nur ein Projekt: keine Auswahl
	await expect(guest.getByText('Projekt wählen…')).toHaveCount(0);

	await guest.getByLabel('Titel').fill('Rechnung fehlt');
	await guest.getByLabel('Beschreibung').fill('Die Rechnung für Oktober kam nicht an.');
	await guest.getByRole('button', { name: 'Einreichen' }).click();
	await expect(guest.getByRole('alert')).toContainText('Bitte eine E-Mail-Adresse angeben.');

	await guest.getByLabel(/Deine E-Mail-Adresse/).fill('kunde@example.com');
	await guest.getByRole('button', { name: 'Einreichen' }).click();
	await expect(guest.getByRole('status')).toContainText(`Dein Ticket ${p.key}-1 wurde eingereicht.`);

	const detail = await getTicket(request, `${p.key}-1`);
	expect(detail).toMatchObject({
		title: 'Rechnung fehlt',
		description: 'Die Rechnung für Oktober kam nicht an.',
		submission: { form: `Kundenanfragen ${p.key}`, email: 'kunde@example.com' }
	});

	// Herkunft im Ticket sichtbar
	await open(page, `/tickets/${p.key}-1`);
	await expect(page.locator('[data-submission]')).toContainText(`Eingereicht über „Kundenanfragen ${p.key}“`);
	await expect(page.getByRole('link', { name: 'kunde@example.com' })).toBeVisible();
});

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

test('Formular mit Anmeldung: Gäste müssen sich anmelden, Angemeldete reichen ohne E-Mail ein', async ({
	page,
	browser,
	baseURL,
	request
}) => {
	const p = await createProject(request, 'Intern');
	const link = await createIntakeForm(page, `Intern ${p.key}`, { projects: [`Intern ${p.key}`], requireLogin: true });

	const guest = await anonymous(browser, baseURL);
	await guest.goto(link);
	await expect(guest).toHaveURL(/\/login\?redirect=/);

	await open(page, new URL(link).pathname);
	await expect(page.getByText('Angemeldet als Erika Test')).toBeVisible();
	await expect(page.getByLabel(/Deine E-Mail-Adresse/)).toHaveCount(0);
	await page.getByLabel('Titel').fill('Neuer Laptop');
	await page.getByRole('button', { name: 'Einreichen' }).click();
	await expect(page.getByRole('status')).toContainText(`${p.key}-1`);
	expect((await getTicket(request, `${p.key}-1`)).submission).toEqual({ form: `Intern ${p.key}`, email: null });
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

test('Einstellbare Felder: Priorität, Fälligkeit, Tags und Anhang beim Einreichen', async ({
	page,
	browser,
	baseURL,
	request
}) => {
	const p = await createProject(request, 'Felder');
	const name = `Felder ${p.key}`;
	const link = await createIntakeForm(page, name, {
		projects: [`Felder ${p.key}`],
		fields: {
			Beschreibung: 'Ausgeblendet',
			Priorität: 'Pflichtfeld',
			Fällig: 'Optional',
			Tags: 'Optional',
			Anhänge: 'Optional'
		}
	});
	await expect(card(page, name).locator('[data-fields]')).toHaveText(
		'Felder: Titel*, Priorität*, Fällig, Tags, Anhänge'
	);

	const guest = await anonymous(browser, baseURL);
	await guest.goto(link);
	await expect(guest.getByLabel('Beschreibung')).toHaveCount(0);
	await expect(guest.getByLabel('Start', { exact: true })).toHaveCount(0);

	await guest.getByLabel('Titel').fill('Mit allen Feldern');
	await guest.getByRole('button', { name: 'Einreichen' }).click();
	await expect(guest.getByRole('alert')).toContainText('Bitte eine Priorität wählen.');

	await guest.getByRole('button').filter({ hasText: 'Priorität wählen…' }).click();
	await guest.getByRole('option', { name: 'Hoch' }).click();
	await guest.getByRole('button', { name: 'Bug', exact: true }).click();
	await guest
		.getByLabel(/Anhänge/)
		.setInputFiles({ name: 'fehler.txt', mimeType: 'text/plain', buffer: Buffer.from('Log') });
	await guest.getByRole('button', { name: 'Einreichen' }).click();
	await expect(guest.getByRole('status')).toContainText(`${p.key}-1`);

	const detail = await getTicket(request, `${p.key}-1`);
	expect(detail).toMatchObject({ title: 'Mit allen Feldern', priority: 'high', description: '' });
	expect(detail.tags.map((t: { name: string }) => t.name)).toEqual(['Bug']);
	expect(detail.attachments.map((a: { filename: string }) => a.filename)).toEqual(['fehler.txt']);
});
