import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { api, createProject, createTicket, day, open } from './helpers';

type Listed = { title: string; priority: string; startDate: string | null };
const listed = async (request: APIRequestContext, key: string) =>
	(await api(request, 'GET', `/projects/${key}/tickets`)) as Listed[];

const palette = (page: Page) => page.getByRole('dialog', { name: 'Suchen und Befehle' });

test('Suche findet Wörter aus der Beschreibung und zeigt einen Ausschnitt', async ({ page, request }) => {
	const p = await createProject(request, 'Inhalt');
	// Eindeutiges Wort pro Lauf, damit Tickets anderer Tests nicht mitgefunden werden
	const word = `zahnrad${p.key.toLowerCase()}`;
	await createTicket(request, p.key, {
		title: 'Wartung planen',
		description: `Vor dem Termin muss das ${word} geschmiert und danach geprüft werden.`
	});
	await open(page, '/');
	await page.keyboard.press('Control+k');
	await page.keyboard.type(`${word} geprüft`);
	const result = palette(page).getByRole('option').filter({ hasText: 'Wartung planen' });
	await expect(result.locator('[data-snippet]')).toContainText(`muss das ${word} geschmiert`);
	await expect(result.locator('[data-snippet] mark')).toHaveText([word, 'geprüft']);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/tickets/${p.key}-1`);
});

test('Befehle: neues Ticket aus jeder Projektseite, Navigation und Design', async ({ page, request }) => {
	const p = await createProject(request, 'Befehle');
	await open(page, `/projects/${p.key}/settings`);
	await page.keyboard.press('Control+k');
	await page.keyboard.type('neue aufgabe');
	await page.keyboard.press('Enter');
	// Wechselt zum Board und öffnet dort den Dialog
	await expect(page).toHaveURL(`/projects/${p.key}/board`);
	const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Neue Aufgabe' }) });
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	// Im Gantt mit derselben Vorbelegung wie der Button: Start heute
	await open(page, `/projects/${p.key}/gantt`);
	await page.keyboard.press('Control+k');
	await palette(page)
		.getByRole('option', { name: /Neue Aufgabe in Befehle/ })
		.click();
	await dialog.getByLabel('Titel').fill('Aus dem Gantt');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(dialog).toBeHidden();
	expect((await listed(request, p.key))[0].startDate).toBe(day(0));

	// Navigation und Design
	await page.keyboard.press('Control+k');
	await page.keyboard.type('einstellungen');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/projects/${p.key}/settings`);
	await page.keyboard.press('Control+k');
	await page.keyboard.type('dunkel');
	await page.keyboard.press('Enter');
	await expect(page.locator('html')).toHaveClass(/dark/);
});

test('„Weitere erstellen“ hält den Dialog offen und behält die Felder', async ({ page, request }) => {
	const p = await createProject(request, 'Serie');
	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Aufgabe', exact: true }).click();
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

	const tickets = await listed(request, p.key);
	expect(tickets.map((t) => t.title).sort()).toEqual(['Drittes', 'Erstes', 'Zweites']);
	expect(tickets.find((t) => t.title === 'Zweites')?.priority).toBe('high');

	// Der Haken wird pro Browser gemerkt
	await page.getByRole('button', { name: 'Aufgabe', exact: true }).click();
	await dialog.getByRole('checkbox', { name: 'Weitere erstellen' }).click();
	await page.keyboard.press('Escape');
	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Aufgabe', exact: true }).click();
	await expect(page.getByRole('dialog').getByRole('checkbox', { name: 'Weitere erstellen' })).toBeChecked();
});
