import { expect, test } from '@playwright/test';
import { api, card, choose, createProject, createTicket, getTicket, open, reload } from './helpers';

test('shadcn bucket picker creates a bucket inside the ticket dialog without losing the draft', async ({
	page,
	request
}) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Ticket', exact: true }).click();
	const ticketDialog = page
		.getByRole('dialog')
		.filter({ has: page.getByRole('heading', { name: 'Neues Ticket', exact: true }) });
	await ticketDialog.getByLabel('Titel', { exact: true }).fill('Preserved draft');
	await ticketDialog.getByLabel('Beschreibung', { exact: true }).fill('Keep this description');
	await ticketDialog.getByRole('combobox', { name: 'Bucket', exact: true }).click();
	await page.getByPlaceholder('Buckets suchen…').fill('Inline bucket');
	await page.getByRole('option', { name: 'Neuer Bucket', exact: true }).click();
	const createDialog = page
		.getByRole('dialog')
		.filter({ has: page.getByRole('heading', { name: 'Neuer Bucket', exact: true }) });
	await expect(createDialog.getByLabel('Name', { exact: true })).toHaveValue('Inline bucket');
	await createDialog.getByRole('button', { name: 'Bucket anlegen', exact: true }).click();
	await expect(createDialog).toHaveCount(0);
	await expect(ticketDialog.getByLabel('Titel', { exact: true })).toHaveValue('Preserved draft');
	await expect(ticketDialog.getByLabel('Beschreibung', { exact: true })).toHaveValue('Keep this description');
	await expect(ticketDialog.getByRole('combobox', { name: 'Bucket', exact: true })).toContainText('Inline bucket');
	await ticketDialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(card(page, 'Preserved draft')).toBeVisible();
	const [bucket] = await api<{ id: number }[]>(request, 'GET', `/projects/${p.key}/buckets`);
	const [ticket] = await api<{ bucketId: number; description: string }[]>(request, 'GET', `/projects/${p.key}/tickets`);
	expect(ticket).toMatchObject({ bucketId: bucket.id, description: 'Keep this description' });
});

test('shadcn bucket picker creates and assigns buckets from an existing ticket', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Existing inline bucket ticket' });
	await open(page, `/tickets/${t.key}`);
	await page.getByRole('combobox', { name: 'Bucket', exact: true }).click();
	await page.getByRole('option', { name: 'Neuer Bucket', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Name', { exact: true }).fill('Ticket bucket');
	await dialog.getByRole('button', { name: 'Bucket anlegen', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Bucket', exact: true })).toContainText('Ticket bucket');
	const [bucket] = await api<{ id: number }[]>(request, 'GET', `/projects/${p.key}/buckets`);
	expect((await getTicket(request, t.key)).bucketId).toBe(bucket.id);
});

for (const width of [1600, 320])
	test(`project navigation has no visible scrollbar at ${width}px and its tabs remain reachable`, async ({
		page,
		request
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const p = await createProject(request);
		await open(page, `/projects/${p.key}/board`);
		const nav = page.getByRole('navigation', { name: 'Projektnavigation', exact: true });
		const dimensions = await nav.evaluate((element) => ({
			scrollbar: getComputedStyle(element).scrollbarWidth,
			overflowY: getComputedStyle(element).overflowY,
			height: element.clientHeight,
			contentHeight: element.scrollHeight,
			width: element.clientWidth,
			contentWidth: element.scrollWidth
		}));
		expect(dimensions.scrollbar).toBe('none');
		expect(dimensions.overflowY).toBe('hidden');
		expect(dimensions.contentHeight).toBeLessThanOrEqual(dimensions.height);
		if (width === 320) expect(dimensions.contentWidth).toBeGreaterThan(dimensions.width);
		await nav.getByRole('link', { name: 'Einstellungen', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/projects/${p.key}/settings$`));
	});

test('bucket groups keep separate Kanban areas, preserve tags and accept moves and quick creation', async ({
	page,
	request
}) => {
	const p = await createProject(request);
	const frontend = await api<{ id: number }>(request, 'POST', `/projects/${p.key}/buckets`, { name: 'Frontend' });
	const backend = await api<{ id: number }>(request, 'POST', `/projects/${p.key}/buckets`, { name: 'Backend' });
	const t = await createTicket(request, p.key, { title: 'Bucket task', bucketId: frontend.id, tags: ['Bug'] });
	await createTicket(request, p.key, { title: 'Unallocated item' });
	await open(page, `/projects/${p.key}/board`);
	await choose(page, /Gruppe/, 'Bucket');
	await expect(
		page.getByRole('region', { name: 'Frontend: Offen', exact: true }).getByText('Bucket task', { exact: true })
	).toBeVisible();
	await expect(page.getByRole('region', { name: 'Backend: Offen', exact: true })).toBeVisible();
	await expect(
		page.getByRole('region', { name: 'Ohne Bucket: Offen', exact: true }).getByText('Unallocated item')
	).toBeVisible();
	await page
		.locator('[data-card]')
		.filter({ has: page.getByRole('link', { name: 'Bucket task', exact: true }) })
		.dragTo(page.getByRole('region', { name: 'Backend: In Arbeit', exact: true }));
	await expect
		.poll(async () => {
			const ticket = await getTicket(request, t.key);
			return {
				bucketId: ticket.bucketId,
				status: ticket.status,
				tags: ticket.tags.map((g: { name: string }) => g.name)
			};
		})
		.toEqual({ bucketId: backend.id, status: 'In Arbeit', tags: ['Bug'] });
	const lane = page.getByRole('region', { name: 'Frontend: Review', exact: true }).locator('..');
	await lane.hover();
	await lane.getByRole('button', { name: 'Ticket hinzufügen' }).click();
	await page.getByPlaceholder('Titel, Enter zum Anlegen').fill('Quick bucket task');
	await page.getByPlaceholder('Titel, Enter zum Anlegen').press('Enter');
	await expect(
		page.getByRole('region', { name: 'Frontend: Review', exact: true }).getByText('Quick bucket task')
	).toBeVisible();
	const tickets = await api<{ title: string; bucketId: number; status: string }[]>(
		request,
		'GET',
		`/projects/${p.key}/tickets`
	);
	expect(tickets.find((ticket) => ticket.title === 'Quick bucket task')).toMatchObject({
		bucketId: frontend.id,
		status: 'Review'
	});
	await reload(page);
	await expect(
		page.getByRole('region', { name: 'Backend: In Arbeit', exact: true }).getByText('Bucket task', { exact: true })
	).toBeVisible();
	await page
		.locator('[data-card]')
		.filter({ has: page.getByRole('link', { name: 'Bucket task', exact: true }) })
		.dragTo(page.getByRole('region', { name: 'Ohne Bucket: Offen', exact: true }));
	await expect.poll(async () => (await getTicket(request, t.key)).bucketId).toBeNull();
});

test('project settings manage buckets, ticket forms assign them and deletion preserves tickets', async ({
	page,
	request
}) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/settings`);
	await page.getByRole('textbox', { name: 'Neuer Bucket', exact: true }).fill('Delivery');
	await page.getByRole('button', { name: 'Bucket anlegen', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Bucket-Name: Delivery', exact: true })).toBeVisible();
	const [bucket] = await api<{ id: number }[]>(request, 'GET', `/projects/${p.key}/buckets`);
	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Ticket', exact: true }).click();
	await page.getByRole('dialog').getByLabel('Titel', { exact: true }).fill('Created with bucket');
	await page.getByRole('dialog').getByRole('combobox', { name: 'Bucket', exact: true }).click();
	await page.getByRole('option', { name: 'Delivery', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(card(page, 'Created with bucket')).toBeVisible();
	const tickets = await api<{ key: string; bucketId: number }[]>(request, 'GET', `/projects/${p.key}/tickets`);
	expect(tickets[0].bucketId).toBe(bucket.id);
	await open(page, `/tickets/${tickets[0].key}`);
	await page.getByRole('combobox', { name: 'Bucket', exact: true }).click();
	await page.getByRole('option', { name: 'Ohne Bucket', exact: true }).click();
	await expect.poll(async () => (await getTicket(request, tickets[0].key)).bucketId).toBeNull();
	await page.getByRole('combobox', { name: 'Bucket', exact: true }).click();
	await page.getByRole('option', { name: 'Delivery', exact: true }).click();
	await expect.poll(async () => (await getTicket(request, tickets[0].key)).bucketId).toBe(bucket.id);
	await open(page, `/projects/${p.key}/settings`);
	const name = page.getByRole('textbox', { name: 'Bucket-Name: Delivery', exact: true });
	await name.fill('Release');
	await name.press('Tab');
	await expect(page.getByRole('textbox', { name: 'Bucket-Name: Release', exact: true })).toBeVisible();
	await page
		.getByRole('textbox', { name: 'Bucket-Name: Release', exact: true })
		.locator('..')
		.getByRole('button', { name: 'Löschen', exact: true })
		.click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Bucket-Name: Release', exact: true })).toHaveCount(0);
	expect((await getTicket(request, tickets[0].key)).bucketId).toBeNull();
});

test('bucket API rejects foreign assignments and readers cannot manage or assign buckets', async ({
	request,
	browser,
	baseURL
}) => {
	const p = await createProject(request);
	const other = await createProject(request);
	const b = await api<{ id: number }>(request, 'POST', `/projects/${p.key}/buckets`, { name: 'Private' });
	const foreign = await api<{ id: number }>(request, 'POST', `/projects/${other.key}/buckets`, { name: 'Foreign' });
	const t = await createTicket(request, p.key, { title: 'Protected', bucketId: b.id });
	expect((await request.patch(`/api/v1/tickets/${t.key}`, { data: { bucketId: foreign.id } })).status()).toBe(400);
	expect((await request.post(`/api/v1/projects/${p.key}/buckets`, { data: { name: 'private' } })).status()).toBe(409);
	const email = `bucket-reader-${Date.now()}@example.com`;
	const reader = await api<{ id: string }>(request, 'POST', '/admin/users', {
		name: 'Bucket reader',
		email,
		password: 'bucket-reader-password'
	});
	await api(request, 'POST', `/projects/${p.key}/members`, { user: reader.id, role: 'reader' });
	const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
	try {
		expect(
			(
				await context.request.post('/api/auth/sign-in/email', {
					headers: { origin: baseURL! },
					data: { email, password: 'bucket-reader-password' }
				})
			).ok()
		).toBeTruthy();
		expect((await context.request.get(`/api/v1/projects/${p.key}/buckets`)).status()).toBe(200);
		expect((await context.request.get(`/api/v1/projects/${other.key}/buckets`)).status()).toBe(404);
		for (const method of ['PATCH', 'DELETE'])
			expect(
				(
					await context.request.fetch(`/api/v1/projects/${p.key}/buckets/${b.id}`, {
						method,
						data: method === 'PATCH' ? { name: 'Forbidden' } : undefined,
						headers: { 'content-type': 'application/json' }
					})
				).status()
			).toBe(403);
		expect(
			(await context.request.post(`/api/v1/projects/${p.key}/buckets`, { data: { name: 'Forbidden' } })).status()
		).toBe(403);
		expect((await context.request.patch(`/api/v1/tickets/${t.key}`, { data: { bucketId: null } })).status()).toBe(403);
		const page = await context.newPage();
		await open(page, `/tickets/${t.key}`);
		await expect(page.getByRole('combobox', { name: 'Bucket', exact: true })).toBeDisabled();
		await api(request, 'PATCH', `/projects/${p.key}/members/${reader.id}`, { role: 'member' });
		await page.reload();
		await page.getByRole('combobox', { name: 'Bucket', exact: true }).click();
		await expect(page.getByRole('option', { name: 'Neuer Bucket', exact: true })).toHaveCount(0);
		await page.getByRole('option', { name: 'Private', exact: true }).click();
		expect(
			(
				await context.request.post(`/api/v1/projects/${p.key}/buckets`, { data: { name: 'Forbidden member bucket' } })
			).status()
		).toBe(403);
	} finally {
		await context.close();
	}
});
