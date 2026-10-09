import { expect, test, type Page } from '@playwright/test';
import { api, createProject, createTicket, day, getTicket, open } from './helpers';

/** Ticketzeile in der Liste links */
const row = (page: Page, title: string) => page.locator('.labels .label').filter({ hasText: title });

test('Backlog-Ticket im Gantt einplanen und wieder in den Backlog legen', async ({ page, request }) => {
	const p = await createProject(request);
	await api(request, 'POST', `/projects/${p.key}/columns`, { name: 'Backlog', isBacklog: true });
	const t = await createTicket(request, p.key, { title: 'Export als CSV', column: 'Backlog' });
	await createTicket(request, p.key, { title: 'Schon geplant', startDate: day(0), dueDate: day(3) });

	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Schon geplant')).toBeVisible();
	// Backlog ist standardmäßig ausgeblendet
	await expect(row(page, 'Export als CSV')).toHaveCount(0);

	await page.getByRole('button', { name: 'Ticket einplanen…' }).click();
	// Bereits eingeplante Tickets stehen nicht in der Suche
	await expect(page.getByRole('option', { name: /Schon geplant/ })).toHaveCount(0);
	await page.getByPlaceholder('Ticket suchen oder neu anlegen…').fill('CSV');
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

	await page.getByRole('button', { name: 'Ticket einplanen…' }).click();
	await page.getByPlaceholder('Ticket suchen oder neu anlegen…').fill('Messestand planen');
	await page.getByRole('option', { name: '„Messestand planen“ als neues Ticket anlegen' }).click();

	await expect(row(page, 'Messestand planen')).toBeVisible();
	const [t] = await api<{ title: string; startDate: string }[]>(request, 'GET', `/projects/${p.key}/tickets`);
	expect(t).toMatchObject({ title: 'Messestand planen', startDate: day(0) });
});

test('Unteraufgaben im Gantt auf- und zuklappen', async ({ page, request }) => {
	const p = await createProject(request);
	const parent = await createTicket(request, p.key, { title: 'Umzug', startDate: day(0), dueDate: day(10) });
	await createTicket(request, p.key, { title: 'Kisten packen', parent: parent.key, startDate: day(1), dueDate: day(2) });

	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Kisten packen')).toHaveCount(0);

	await row(page, 'Umzug').getByRole('button', { name: /Unteraufgaben aufklappen/ }).click();
	await expect(row(page, 'Kisten packen')).toBeVisible();

	await row(page, 'Umzug').getByRole('button', { name: /Unteraufgaben zuklappen/ }).click();
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
