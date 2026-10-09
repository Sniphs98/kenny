import { expect, test } from '@playwright/test';
import { createProject, createTicket, getTicket, open } from './helpers';

test('API rejects missing or invalid authentication', async ({ playwright, baseURL }) => {
	const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
	try {
		expect((await anonymous.get('/api/v1/projects')).status()).toBe(401);
		expect(
			(await anonymous.get('/api/v1/projects', { headers: { authorization: 'Bearer invalid-token' } })).status()
		).toBe(401);
		expect((await anonymous.get('/api/health')).status()).toBe(200);
	} finally {
		await anonymous.dispose();
	}
});

test('API rejects malformed JSON, unknown fields and invalid values without creating tickets', async ({ request }) => {
	const project = await createProject(request);
	const path = `/api/v1/projects/${project.key}/tickets`;
	for (const data of ['{broken', '[]', 'null']) {
		const response = await request.post(path, { data, headers: { 'content-type': 'application/json' } });
		expect(response.status()).toBe(400);
		expect(await response.json()).toHaveProperty('error');
	}
	for (const data of [
		{ title: 'Test', internalFlag: true },
		{ title: 'Test', priority: 'critical' },
		{ title: 'Test', startDate: '2026-02-30' },
		{ title: 'Test', tags: [true] }
	]) {
		expect((await request.post(path, { data })).status()).toBe(400);
	}
	expect(await (await request.get(path)).json()).toEqual([]);
});

test('PATCH preserves omitted fields and clears explicit nulls; missing tickets return 404', async ({ request }) => {
	const project = await createProject(request);
	const ticket = await createTicket(request, project.key, {
		title: 'Contract',
		startDate: '2026-10-10',
		dueDate: '2026-10-20'
	});
	const path = `/api/v1/tickets/${ticket.key}`;
	expect((await request.patch(path, { data: { dueDate: '2026-10-09' } })).status()).toBe(400);
	expect((await request.patch(path, { data: { title: 'Updated', startDate: null } })).status()).toBe(200);
	const detail = await getTicket(request, ticket.key);
	expect(detail.title).toBe('Updated');
	expect(detail.startDate).toBeNull();
	expect(detail.dueDate).toBe('2026-10-20');
	expect((await request.get(`/api/v1/tickets/${project.key}-99999`)).status()).toBe(404);
});

test('personal API tokens work independently of browser sessions and can be revoked', async ({
	page,
	playwright,
	baseURL
}) => {
	await open(page, '/settings/api');
	const name = `Token test ${Date.now()}`;
	await page.getByPlaceholder('Name, z.B. CI-Pipeline').fill(name);
	await page.getByRole('button', { name: 'Token erstellen' }).click();
	const tokenElement = page.locator('code').filter({ hasText: /^kny_[A-Za-z0-9_-]+$/ });
	await expect(tokenElement).toBeVisible();
	const token = await tokenElement.innerText();
	const client = await playwright.request.newContext({
		baseURL,
		storageState: { cookies: [], origins: [] },
		extraHTTPHeaders: { authorization: `Bearer ${token}` }
	});
	try {
		expect((await client.get('/api/v1/projects')).status()).toBe(200);
		const row = page.getByRole('row').filter({ hasText: name });
		await row.getByRole('button', { name: 'Widerrufen' }).click();
		await expect(row).toHaveCount(0);
		expect((await client.get('/api/v1/projects')).status()).toBe(401);
	} finally {
		await client.dispose();
	}
});

test('project responses expose only public fields', async ({ request }) => {
	const project = await createProject(request);
	const data = await (await request.get(`/api/v1/projects/${project.key}`)).json();
	expect(data).toHaveProperty('columns');
	expect(data).not.toHaveProperty('ownerId');
	expect(data).not.toHaveProperty('ticketCounter');
});
