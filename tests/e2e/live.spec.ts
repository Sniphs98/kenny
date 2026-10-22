import { expect, test } from '@playwright/test';
import { api, card, createProject, createTicket, open } from './helpers';

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
	await expect(page.getByRole('region', { name: 'Allgemein: Review', exact: true }).locator('[data-card]')).toHaveCount(
		1
	);
});

test('Projektübersicht zeigt neue Projekte live', async ({ page, request }) => {
	await open(page, '/');
	const p = await createProject(request, 'Live-Projekt');
	await expect(page.getByText(`Live-Projekt ${p.key}`)).toBeVisible();
});

test('Live-Neuladen bricht eine laufende Navigation nicht ab', async ({ page, request }) => {
	const target = await createProject(request, 'Ziel');
	await open(page, '/');
	// Verbindung steht: ein neues Projekt erscheint live
	const first = await createProject(request, 'Verbunden');
	await expect(page.getByText(`Verbunden ${first.key}`)).toBeVisible();

	// Die Navigation zum Board dauert; währenddessen ändert jemand anderes etwas
	await page.route(`**/projects/${target.key}/board/__data.json*`, async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await route.continue();
	});
	await page
		.getByRole('link')
		.filter({ hasText: `Ziel ${target.key}` })
		.click();
	await createProject(request, 'Zwischendurch');
	await expect(page).toHaveURL(`/projects/${target.key}/board`, { timeout: 10_000 });
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
		const signup = await request.post('/api/v1/admin/users', {
			headers: { origin: baseURL! },
			data: { name: 'Live reader', email: `live-${Date.now()}@example.com`, password: 'live-permissions-password' }
		});
		expect(signup.ok()).toBeTruthy();
		const user = await signup.json();
		expect(
			(
				await context.request.post('/api/auth/sign-in/email', {
					headers: { origin: baseURL! },
					data: { email: user.email, password: 'live-permissions-password' }
				})
			).ok()
		).toBeTruthy();
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

test('externally deleted tickets close shallow dialogs after a preload error', async ({ page, request }) => {
	const p = await createProject(request, 'Deleted modal');
	const t = await createTicket(request, p.key, { title: 'Deleted in another tab' });
	await open(page, `/projects/${p.key}/board`);
	await card(page, t.title).getByRole('link', { name: t.title, exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page).toHaveURL(`/tickets/${t.key}`);
	await api(request, 'DELETE', `/tickets/${t.key}`);
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page).toHaveURL(`/projects/${p.key}/board`);
});
