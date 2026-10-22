import { expect, test, type Page } from '@playwright/test';
import { api, createProject, createTicket as createRawTicket, day, getTicket, open } from './helpers';

const createTicket = (
	request: Parameters<typeof createRawTicket>[0],
	projectKey: string,
	data: Record<string, unknown>
) => createRawTicket(request, projectKey, { kind: 'main', ...data });

/** Ticketzeile in der Liste links */
const row = (page: Page, title: string) => page.locator('.labels .label').filter({ hasText: title });

test('neues Ticket direkt aus der Einplanen-Suche anlegen', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/gantt`);

	await page.getByRole('button', { name: 'Hauptaufgabe einplanen…' }).click();
	await page.getByPlaceholder('Hauptaufgabe suchen oder anlegen…').fill('Messestand planen');
	await page.getByRole('option', { name: '„Messestand planen“ als neue Hauptaufgabe anlegen' }).click();

	await expect(row(page, 'Messestand planen')).toBeVisible();
	const [t] = await api<{ title: string; kind: string; parentId: number | null; startDate: string }[]>(
		request,
		'GET',
		`/projects/${p.key}/tickets`
	);
	expect(t).toMatchObject({ title: 'Messestand planen', kind: 'main', parentId: null, startDate: day(0) });
});

test('Gantt passt ohne horizontale Scrollleiste, wenn alle Termine hineinpassen', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Kurz', startDate: day(0), dueDate: day(2) });

	await open(page, `/projects/${p.key}/gantt`);
	await expect(row(page, 'Kurz')).toBeVisible();
	const overflow = await page.locator('.gantt').evaluate((el) => el.scrollWidth - el.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
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
