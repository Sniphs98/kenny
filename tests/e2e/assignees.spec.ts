import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { userSchema } from '../../src/lib/contracts';
import { api, card, createProject, createTicket, getTicket, open } from './helpers';

let counter = 0;

/** Weitere Person anlegen und dem Projekt als Mitglied hinzufügen */
async function addPerson(
	playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } },
	baseURL: string,
	request: APIRequestContext,
	projectKey: string,
	name: string
) {
	const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
	try {
		const response = await request.post('/api/v1/admin/users', {
			headers: { origin: baseURL },
			data: { name, email: `assignee-${Date.now()}-${counter++}@example.com`, password: 'assignee-test-password' }
		});
		expect(response.ok(), await response.text()).toBeTruthy();
		const user = userSchema.parse(await response.json());
		await api(request, 'POST', `/projects/${projectKey}/members`, { user: user.id, role: 'member' });
		return user;
	} finally {
		await anonymous.dispose();
	}
}

const me = async (request: APIRequestContext) => api<{ id: string; name: string }>(request, 'GET', '/me');

async function pick(page: Page, name: string) {
	await page.getByRole('option', { name: new RegExp(name) }).click();
}

test('mehrere Zuständige im Ticket wählen und wieder entfernen', async ({ page, request, playwright, baseURL }) => {
	const p = await createProject(request);
	const anna = await addPerson(playwright, baseURL!, request, p.key, 'Anna Assignee');
	const ben = await addPerson(playwright, baseURL!, request, p.key, 'Ben Assignee');
	const t = await createTicket(request, p.key, { title: 'Gemeinsam erledigen' });

	await open(page, `/tickets/${t.key}`);
	await page.getByRole('button', { name: 'Niemandem zugewiesen', exact: true }).click();
	// Die Liste bleibt offen, mehrere Personen nacheinander wählbar
	await pick(page, 'Anna Assignee');
	await pick(page, 'Ben Assignee');
	await expect.poll(async () => (await getTicket(request, t.key)).assigneeIds).toEqual([anna.id, ben.id]);
	await page.keyboard.press('Escape');
	const trigger = page.getByRole('button', { name: 'Zuständig: Anna Assignee, Ben Assignee', exact: true });
	await expect(trigger).toBeVisible();

	// „Mir zuweisen“ ergänzt, statt zu ersetzen
	const self = await me(request);
	await page.getByRole('button', { name: 'Mir zuweisen' }).click();
	await expect.poll(async () => (await getTicket(request, t.key)).assigneeIds).toEqual([anna.id, ben.id, self.id]);
	await expect(page.getByRole('button', { name: 'Mir zuweisen' })).toHaveCount(0);

	// Abwählen entfernt nur diese Person, „Niemand“ leert die Liste
	await page.getByRole('button', { name: new RegExp('^Zuständig: Anna Assignee') }).click();
	await pick(page, 'Anna Assignee');
	await expect.poll(async () => (await getTicket(request, t.key)).assigneeIds).toEqual([ben.id, self.id]);
	await page.getByRole('option', { name: 'Niemand' }).click();
	await expect.poll(async () => (await getTicket(request, t.key)).assigneeIds).toEqual([]);
	await expect(page.getByRole('button', { name: 'Niemandem zugewiesen', exact: true })).toBeVisible();
});

test('Board zeigt alle Zuständigen und filtert und gruppiert nach jeder Person', async ({
	page,
	request,
	playwright,
	baseURL
}) => {
	const p = await createProject(request);
	const anna = await addPerson(playwright, baseURL!, request, p.key, 'Anna Board');
	const ben = await addPerson(playwright, baseURL!, request, p.key, 'Ben Board');
	const pair = await createTicket(request, p.key, { title: 'Pair-Programming', assignees: [anna.id, ben.id] });
	await createTicket(request, p.key, { title: 'Nur Anna', assignees: [anna.id] });
	await createTicket(request, p.key, { title: 'Offen für alle' });

	await open(page, `/projects/${p.key}/board`);
	await expect(
		card(page, 'Pair-Programming').getByRole('button', { name: 'Zuständig: Anna Board, Ben Board', exact: true })
	).toBeVisible();

	await page.getByRole('button', { name: /Aktuelle Einstellungen/ }).click();
	await page.locator('#board-view-assignee').click();
	await page.getByRole('option', { name: 'Ben Board', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(card(page, 'Pair-Programming')).toBeVisible();
	await expect(card(page, 'Nur Anna')).toHaveCount(0);
	await page.locator('#board-view-assignee').click();
	await page.getByRole('option', { name: 'Ben Board', exact: true }).click();
	await page.getByRole('option', { name: 'Nicht zugewiesen', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(card(page, 'Offen für alle')).toBeVisible();
	await expect(card(page, 'Pair-Programming')).toHaveCount(0);
	await page.locator('#board-view-assignee').click();
	await page.getByRole('option', { name: 'Nicht zugewiesen', exact: true }).click();
	await page.keyboard.press('Escape');

	// Gruppiert erscheint das Ticket in beiden Bahnen; Ziehen ersetzt nur die Person der alten Bahn
	await page.locator('#board-view-group').click();
	await page.getByRole('option', { name: 'Zuständig', exact: true }).click();
	await page.getByRole('button', { name: /Aktuelle Einstellungen/ }).click();
	await expect(page.getByRole('region', { name: 'Anna Board: Offen' }).getByText('Pair-Programming')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Ben Board: Offen' }).getByText('Pair-Programming')).toBeVisible();
	await page
		.getByRole('region', { name: 'Ben Board: Offen' })
		.locator('[data-card]')
		.filter({ hasText: 'Pair-Programming' })
		.dragTo(page.getByRole('region', { name: 'Anna Board: In Arbeit' }));
	await expect
		.poll(async () => {
			const t = await getTicket(request, pair.key);
			return { status: t.status, assignees: t.assigneeIds };
		})
		.toEqual({ status: 'In Arbeit', assignees: [anna.id] });
	await expect(page.getByRole('region', { name: 'Ben Board: In Arbeit' })).toHaveCount(0);
});

test('neues Ticket mit mehreren Zuständigen anlegen', async ({ page, request, playwright, baseURL }) => {
	const p = await createProject(request);
	const anna = await addPerson(playwright, baseURL!, request, p.key, 'Anna Dialog');
	const ben = await addPerson(playwright, baseURL!, request, p.key, 'Ben Dialog');

	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Aufgabe', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Titel').fill('Zu zweit');
	await dialog.getByRole('button', { name: 'Niemandem zugewiesen', exact: true }).click();
	await pick(page, 'Anna Dialog');
	await pick(page, 'Ben Dialog');
	await page.keyboard.press('Escape');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(dialog).toBeHidden();

	const [t] = await api<{ title: string; assigneeIds: string[] }[]>(request, 'GET', `/projects/${p.key}/tickets`);
	expect(t).toMatchObject({ title: 'Zu zweit', assigneeIds: [anna.id, ben.id] });
});
