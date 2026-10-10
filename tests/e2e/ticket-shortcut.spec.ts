import { expect, test, type APIRequestContext } from '@playwright/test';
import { api, createProject, day, open } from './helpers';

type Listed = { title: string; priority: string };
const titles = async (request: APIRequestContext, key: string) =>
	((await api(request, 'GET', `/projects/${key}/tickets`)) as Listed[]).map((t) => t.title).sort();

test('Taste C öffnet „Neues Ticket“, aber nicht beim Tippen', async ({ page, request }) => {
	const p = await createProject(request, 'Kürzel');
	await open(page, `/projects/${p.key}/board`);
	await expect(page.getByRole('button', { name: 'Ticket', exact: true })).toHaveAttribute('aria-keyshortcuts', 'C');

	// Beim Tippen in der Suche ist „c“ ein Buchstabe
	await page.getByPlaceholder('Tickets suchen…').fill('');
	await page.getByPlaceholder('Tickets suchen…').pressSequentially('abc');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByPlaceholder('Tickets suchen…')).toHaveValue('abc');

	// Mit Strg ist es kein Kürzel
	await page.getByPlaceholder('Tickets suchen…').blur();
	await page.keyboard.press('Control+c');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.keyboard.press('c');
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Neues Ticket' })).toBeVisible();
	// Ein zweites „c“ landet im Titel, statt den Dialog neu zu öffnen
	await dialog.getByLabel('Titel').pressSequentially('c');
	await expect(dialog.getByLabel('Titel')).toHaveValue('c');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	// Im Gantt mit derselben Vorbelegung wie der Button: Start heute
	await open(page, `/projects/${p.key}/gantt`);
	await page.keyboard.press('c');
	await expect(page.getByRole('dialog').getByRole('heading', { name: 'Neues Ticket' })).toBeVisible();
	await page.getByRole('dialog').getByLabel('Titel').fill('Aus dem Gantt');
	await page.getByRole('dialog').getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	const [planned] = (await api(request, 'GET', `/projects/${p.key}/tickets`)) as { startDate: string }[];
	expect(planned.startDate).toBe(day(0));
});

test('„Weitere erstellen“ hält den Dialog offen und behält die Felder', async ({ page, request }) => {
	const p = await createProject(request, 'Serie');
	await open(page, `/projects/${p.key}/board`);
	await page.keyboard.press('c');
	const dialog = page.getByRole('dialog');
	const title = dialog.getByLabel('Titel');
	await dialog.getByRole('checkbox', { name: 'Weitere erstellen' }).click();
	await dialog.getByRole('button').filter({ hasText: 'Mittel' }).click();
	await page.getByRole('option', { name: 'Hoch' }).click();

	await title.fill('Erstes');
	await dialog.getByLabel('Beschreibung').fill('Nur beim ersten');
	await title.press('Enter');
	await expect(page.getByText(`${p.key}-1 angelegt`)).toBeVisible();
	await expect(dialog).toBeVisible();
	await expect(title).toHaveValue('');
	await expect(title).toBeFocused();
	await expect(dialog.getByLabel('Beschreibung')).toHaveValue('');
	await expect(dialog.getByRole('button').filter({ hasText: 'Hoch' })).toBeVisible();

	// Schnelles doppeltes Enter legt nichts doppelt an
	await title.fill('Zweites');
	await title.press('Enter');
	await title.press('Enter');
	await expect(page.getByText(`${p.key}-2 angelegt`)).toBeVisible();

	// Ohne Haken schließt der Dialog nach dem Anlegen wieder
	await dialog.getByRole('checkbox', { name: 'Weitere erstellen' }).click();
	await title.fill('Drittes');
	await title.press('Enter');
	await expect(dialog).toBeHidden();

	expect(await titles(request, p.key)).toEqual(['Drittes', 'Erstes', 'Zweites']);
	const listed = (await api(request, 'GET', `/projects/${p.key}/tickets`)) as Listed[];
	expect(listed.find((t) => t.title === 'Zweites')?.priority).toBe('high');

	// Der Haken wird pro Browser gemerkt
	await page.keyboard.press('c');
	await dialog.getByRole('checkbox', { name: 'Weitere erstellen' }).click();
	await page.keyboard.press('Escape');
	await open(page, `/projects/${p.key}/board`);
	await page.keyboard.press('c');
	await expect(page.getByRole('dialog').getByRole('checkbox', { name: 'Weitere erstellen' })).toBeChecked();
});
