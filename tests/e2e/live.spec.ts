import { expect, test } from '@playwright/test';
import { api, card, createProject, createTicket, getTicket, open } from './helpers';

test('Board zeigt Änderungen über die API ohne Neuladen', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Schon da' });
	await open(page, `/projects/${p.key}/board`);
	await expect(card(page, 'Schon da')).toBeVisible();

	// Änderungen von außen (anderer Client, z. B. Skript mit API-Token)
	const t = await createTicket(request, p.key, { title: 'Live angelegt' });
	await expect(card(page, 'Live angelegt')).toBeVisible();

	await api(request, 'PATCH', `/tickets/${t.key}`, { title: 'Live umbenannt', column: 'Review' });
	await expect(card(page, 'Live umbenannt')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Review', exact: true }).locator('[data-card]')).toHaveCount(1);
});

test('Offenes Ticket-Modal aktualisiert sich, ungespeicherte Eingaben bleiben erhalten', async ({ page, context }) => {
	const p = await createProject(page.request);
	const t = await createTicket(page.request, p.key, { title: 'Gemeinsam bearbeiten' });

	// Tab A: Modal offen, Beschreibung wird gerade bearbeitet (nicht gespeichert)
	await open(page, `/projects/${p.key}/board`);
	await card(page, 'Gemeinsam bearbeiten').getByRole('link', { name: 'Gemeinsam bearbeiten' }).click();
	const modal = page.getByRole('dialog');
	await expect(modal).toBeVisible();
	await modal.getByRole('button', { name: 'Bearbeiten' }).click();
	const editor = modal.locator('textarea');
	await editor.fill('Mein Entwurf, noch nicht gespeichert');

	// Tab B: ändert dasselbe Ticket über die Oberfläche
	const other = await context.newPage();
	await open(other, `/tickets/${t.key}`);
	const title = other.getByRole('textbox', { name: 'Titel', exact: true });
	await title.fill('Von Tab B geändert');
	await title.press('Enter');
	await expect.poll(async () => (await getTicket(other.request, t.key)).title).toBe('Von Tab B geändert');

	// Tab A: Titel im Modal ist aktualisiert, der Entwurf ist unverändert
	await expect(modal.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue('Von Tab B geändert');
	await expect(editor).toHaveValue('Mein Entwurf, noch nicht gespeichert');
	await expect(card(page, 'Von Tab B geändert')).toBeVisible();

	// Speichern übernimmt den Entwurf
	await modal.getByRole('button', { name: 'Speichern' }).click();
	await expect
		.poll(async () => (await getTicket(other.request, t.key)).description)
		.toBe('Mein Entwurf, noch nicht gespeichert');
	await expect(other.getByText('Mein Entwurf, noch nicht gespeichert')).toBeVisible();
});

test('Projektübersicht zeigt neue Projekte live', async ({ page, request }) => {
	await open(page, '/');
	const p = await createProject(request, 'Live-Projekt');
	await expect(page.getByText(`Live-Projekt ${p.key}`)).toBeVisible();
});

test.describe('ohne Anmeldung', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('Event-Stream verlangt eine Anmeldung', async ({ request }) => {
		const res = await request.get('/api/v1/events');
		expect(res.status()).toBe(401);
		expect(res.headers()['content-type']).toContain('application/json');
	});
});

test('live streams enforce project access when connecting and after membership removal', async ({
	browser,
	request,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
	try {
		const signup = await context.request.post('/api/auth/sign-up/email', {
			headers: { origin: baseURL! },
			data: { name: 'Live reader', email: `live-${Date.now()}@example.com`, password: 'live-permissions-password' }
		});
		expect(signup.ok()).toBeTruthy();
		const { user } = await signup.json();
		const allowed = await createProject(request, 'Live accessible');
		const revoked = await createProject(request, 'Live revoked');
		const hidden = await createProject(request, 'Live hidden');
		for (const p of [allowed, revoked])
			await api(request, 'POST', `/projects/${p.key}/members`, { user: user.id, role: 'reader' });
		expect((await context.request.get(`/api/v1/events?project=${hidden.key}`)).status()).toBe(404);
		const page = await context.newPage();
		await page.goto('/settings/api');
		await page.evaluate(() => {
			const events: { projectId: number }[] = [];
			const stream = new EventSource('/api/v1/events');
			Object.assign(window, { permissionEvents: events, permissionStreamReady: false, permissionStream: stream });
			stream.onopen = () => Object.assign(window, { permissionStreamReady: true });
			stream.addEventListener('change', (e) => events.push(JSON.parse(e.data)));
		});
		await expect.poll(() => page.evaluate(() => Reflect.get(window, 'permissionStreamReady'))).toBe(true);
		await createTicket(request, hidden.key, { title: 'Private event' });
		await createTicket(request, revoked.key, { title: 'Initially accessible' });
		await expect.poll(() => page.evaluate(() => Reflect.get(window, 'permissionEvents').length)).toBe(1);
		await api(request, 'DELETE', `/projects/${revoked.key}/members/${user.id}`);
		await createTicket(request, revoked.key, { title: 'Revoked event' });
		await createTicket(request, allowed.key, { title: 'Allowed marker' });
		await expect.poll(() => page.evaluate(() => Reflect.get(window, 'permissionEvents').length)).toBe(2);
		expect(
			await page.evaluate(() => Reflect.get(window, 'permissionEvents').map((e: { projectId: number }) => e.projectId))
		).toEqual([revoked.id, allowed.id]);
		await page.evaluate(() => Reflect.get(window, 'permissionStream').close());
	} finally {
		await context.close();
	}
});
