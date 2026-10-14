import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { userSchema } from '../../src/lib/contracts';
import { api, createProject, createTicket, open } from './helpers';

let counter = 0;
test('global user management assigns projects, changes roles and removes memberships per user', async ({
	page,
	request,
	browser,
	baseURL
}) => {
	const target = await register(browser, baseURL!, 'Central member');
	try {
		const p = await createProject(request, `Central access ${Date.now()}`);
		await page.context().addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en', url: baseURL! }]);
		await open(page, '/admin/users');
		await page.getByRole('textbox', { name: 'Search by name or email' }).fill(target.user.email);
		await page
			.getByRole('row')
			.filter({ hasText: target.user.email })
			.getByRole('link', { name: 'Projects', exact: true })
			.click();
		await expect(page.getByRole('heading', { name: 'Projects for Central member', exact: true })).toBeVisible();
		await page.getByLabel('Search projects', { exact: true }).fill(p.key);
		await page.getByLabel('Select project', { exact: true }).selectOption(String(p.id));
		await page.getByLabel('Role', { exact: true }).selectOption('reader');
		await page.getByRole('button', { name: 'Assign project', exact: true }).click();
		const row = page.getByRole('row').filter({ hasText: p.key });
		await expect(row).toBeVisible();
		expect((await target.context.request.get(`/api/v1/projects/${p.key}`)).status()).toBe(200);
		expect(
			(
				await target.context.request.post(`/api/v1/projects/${p.key}/tickets`, { data: { title: 'Forbidden' } })
			).status()
		).toBe(403);
		await row.getByRole('combobox').selectOption('member');
		await expect
			.poll(
				async () => (await api<{ role: string }[]>(request, 'GET', `/admin/users/${target.user.id}/projects`))[0]?.role
			)
			.toBe('member');
		expect(
			(await target.context.request.post(`/api/v1/projects/${p.key}/tickets`, { data: { title: 'Allowed' } })).status()
		).toBe(201);
		expect((await target.context.request.get(`/admin/users/${target.user.id}/projects`)).status()).toBe(403);
		expect((await target.context.request.get(`/api/v1/admin/users/${target.user.id}/projects`)).status()).toBe(403);
		expect(
			(
				await target.context.request.post(`/api/v1/admin/users/${target.user.id}/projects`, {
					data: { projectId: p.id, role: 'admin' }
				})
			).status()
		).toBe(403);
		expect(
			(
				await target.context.request.patch(`/api/v1/admin/users/${target.user.id}/projects/${p.id}`, {
					data: { role: 'admin' }
				})
			).status()
		).toBe(403);
		expect(
			(
				await target.context.request.delete(`/api/v1/admin/users/${target.user.id}/projects/${p.id}`, {
					headers: { 'content-type': 'application/json' }
				})
			).status()
		).toBe(403);
		await row.getByRole('button', { name: 'Remove', exact: true }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
		await expect(row).toHaveCount(0);
		expect((await target.context.request.get(`/api/v1/projects/${p.key}`)).status()).toBe(404);
		expect(
			(
				await request.delete(
					`/api/v1/admin/users/${(await api<{ id: string }>(request, 'GET', '/me')).id}/projects/${p.id}`,
					{ headers: { 'content-type': 'application/json' } }
				)
			).status()
		).toBe(409);
		await api(request, 'PATCH', `/admin/users/${target.user.id}`, { active: false });
		await page.reload();
		await expect(page.getByRole('button', { name: 'Assign project', exact: true })).toBeDisabled();
	} finally {
		await target.context.close();
	}
});
test('only administrators can create accounts after bootstrap and keep their own session', async ({
	page,
	request,
	browser,
	baseURL
}) => {
	const anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
	try {
		const data = {
			name: 'Blocked signup',
			email: `blocked-${Date.now()}@example.com`,
			password: 'blocked-password',
			role: 'admin',
			active: false
		};
		expect(
			(await anonymous.request.post('/api/auth/sign-up/email', { headers: { origin: baseURL! }, data })).ok()
		).toBe(false);
		expect((await anonymous.request.post('/api/v1/admin/users', { data })).status()).toBe(401);
		const before = await api<{ id: string }>(request, 'GET', '/me');
		await page.context().addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en', url: baseURL! }]);
		await open(page, '/admin/users');
		const form = page.locator('form');
		const email = `admin-created-${Date.now()}@example.com`;
		await form.getByLabel('Name', { exact: true }).fill('Created in UI');
		await form.getByLabel('Email', { exact: true }).fill(email);
		await form.getByLabel('Password', { exact: true }).fill('admin-created-password');
		await form.getByRole('button', { name: 'Create user', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('User created.');
		expect((await api<{ id: string }>(request, 'GET', '/me')).id).toBe(before.id);
		expect(
			(
				await anonymous.request.post('/api/auth/sign-in/email', {
					headers: { origin: baseURL! },
					data: { email, password: 'admin-created-password' }
				})
			).ok()
		).toBe(true);
		expect(
			(
				await anonymous.request.post('/api/v1/admin/users', {
					data: { name: 'Forbidden', email: data.email, password: data.password }
				})
			).status()
		).toBe(403);
		await anonymous.clearCookies();
		const login = await anonymous.newPage();
		await open(login, '/login');
		await expect(login.locator('a[href="#register"]')).toHaveCount(0);
	} finally {
		await anonymous.close();
	}
});
async function register(browser: Browser, baseURL: string, name: string) {
	const context = await browser.newContext({ baseURL, locale: 'en-GB', storageState: { cookies: [], origins: [] } });
	const email = `access-${Date.now()}-${counter++}@example.com`;
	const admin = await browser.newContext({ baseURL, storageState: 'playwright/.auth/user.json' });
	const response = await admin.request.post('/api/v1/admin/users', {
		headers: { origin: baseURL },
		data: { name, email, password: 'permission-test-password' }
	});
	expect(response.ok(), await response.text()).toBeTruthy();
	const identity = userSchema.parse(await response.json());
	await admin.close();
	const signin = await context.request.post('/api/auth/sign-in/email', {
		headers: { origin: baseURL },
		data: { email, password: 'permission-test-password' }
	});
	expect(signin.ok()).toBeTruthy();
	await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en', url: baseURL }]);
	return { context, user: identity };
}
async function dispose(contexts: BrowserContext[]) {
	await Promise.all(contexts.map((c) => c.close()));
}

test('administrators can search and select active users from the membership list', async ({
	page,
	request,
	browser,
	baseURL
}) => {
	const target = await register(browser, baseURL!, 'Selectable colleague');
	const disabled = await register(browser, baseURL!, 'Disabled colleague');
	try {
		await api(request, 'PATCH', `/admin/users/${disabled.user.id}`, { active: false });
		const p = await createProject(request, 'User selection');
		await page.context().addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en', url: baseURL! }]);
		await open(page, `/projects/${p.key}/members`);
		const select = page.getByLabel('Select user', { exact: true });
		await expect(select.getByRole('option', { name: new RegExp(disabled.user.email) })).toHaveCount(0);
		await page.getByLabel('Search by name or email', { exact: true }).fill('Selectable colleague');
		await expect(select.getByRole('option')).toHaveCount(2);
		await select.selectOption(target.user.email);
		await expect(page.getByLabel('Email', { exact: true })).toHaveValue(target.user.email);
		await page.getByLabel('Role', { exact: true }).selectOption('reader');
		await page.getByRole('button', { name: 'Add member', exact: true }).click();
		await expect(page.getByRole('row').filter({ hasText: target.user.email })).toBeVisible();
		await expect(select.getByRole('option', { name: new RegExp(target.user.email) })).toHaveCount(0);
		await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
	} finally {
		await dispose([target.context, disabled.context]);
	}
});

test('cross-project links require edit access to both projects when deleted', async ({ request, browser, baseURL }) => {
	const actor = await register(browser, baseURL!, 'Cross-project member');
	try {
		const first = await createProject(request, 'First link project');
		const second = await createProject(request, 'Second link project');
		const source = await createTicket(request, first.key, { title: 'Source' });
		const target = await createTicket(request, second.key, { title: 'Target' });
		await api(request, 'POST', `/projects/${first.key}/members`, { user: actor.user.id, role: 'member' });
		const link = await api<{ id: number }>(request, 'POST', `/tickets/${source.key}/links`, {
			target: target.key,
			type: 'depends_on'
		});
		const path = `/api/v1/tickets/${source.key}/links/${link.id}`;
		const options = { headers: { 'content-type': 'application/json' } };
		expect((await actor.context.request.delete(path, options)).status()).toBe(404);
		await api(request, 'POST', `/projects/${second.key}/members`, { user: actor.user.id, role: 'reader' });
		expect((await actor.context.request.delete(path, options)).status()).toBe(403);
		await api(request, 'PATCH', `/projects/${second.key}/members/${actor.user.id}`, { role: 'member' });
		expect((await actor.context.request.delete(path, options)).status()).toBe(200);
	} finally {
		await actor.context.close();
	}
});

test('project roles protect every resource and do not allow signup to elevate privileges', async ({
	request,
	browser,
	baseURL
}) => {
	const member = await register(browser, baseURL!, 'Access member');
	const reader = await register(browser, baseURL!, 'Access reader');
	const outsider = await register(browser, baseURL!, 'Access outsider');
	try {
		expect((await member.context.request.get('/api/v1/admin/users')).status()).toBe(403);
		expect((await member.context.request.get('/settings/forms')).status()).toBe(403);
		for (const action of ['save', 'regenerate', 'delete']) {
			expect(
				(
					await member.context.request.post(`/settings/forms?/${action}`, {
						headers: { origin: baseURL! },
						form: { id: '1' }
					})
				).status()
			).toBe(403);
		}
		await member.context.request.post('/api/auth/update-user', {
			headers: { origin: baseURL! },
			data: { role: 'admin' }
		});
		expect((await member.context.request.get('/api/v1/admin/users')).status()).toBe(403);
		const p = await createProject(request, 'Permissions');
		const t = await createTicket(request, p.key, { title: 'Protected task' });
		await api(request, 'POST', `/projects/${p.key}/members`, { user: member.user.id, role: 'member' });
		await api(request, 'POST', `/projects/${p.key}/members`, { user: reader.user.id, role: 'reader' });
		const upload = await request.post(`/api/v1/tickets/${t.key}/attachments`, {
			headers: { origin: baseURL! },
			multipart: { file: { name: 'fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') } }
		});
		expect(upload.ok(), await upload.text()).toBeTruthy();
		const [attachment] = await upload.json();
		const detail = await api<{ columns: { id: number }[] }>(request, 'GET', `/projects/${p.key}`);
		const tag = await api<{ id: number }>(request, 'POST', `/projects/${p.key}/tags`, { name: 'Protected tag' });
		for (const path of [
			`/projects/${p.key}`,
			`/projects/${p.key}/tickets`,
			`/tickets/${t.key}`,
			`/attachments/${attachment.id}`
		]) {
			expect((await reader.context.request.get(`/api/v1${path}`)).status(), path).toBe(200);
			expect((await outsider.context.request.get(`/api/v1${path}`)).status(), path).toBe(404);
		}
		for (const [method, path, data] of [
			['PATCH', `/tickets/${t.key}`, { title: 'Forbidden' }],
			['DELETE', `/tickets/${t.key}`, undefined],
			['POST', `/tickets/${t.key}/close`, {}],
			['POST', `/tickets/${t.key}/reopen`, {}],
			['POST', `/tickets/${t.key}/subtasks`, { title: 'Child' }],
			['POST', `/tickets/${t.key}/links`, { target: t.key, type: 'relates' }],
			['POST', `/tickets/${t.key}/attachments`, {}],
			['DELETE', `/attachments/${attachment.id}`, undefined],
			['POST', `/projects/${p.key}/tickets`, { title: 'Forbidden' }]
		] as const) {
			expect(
				(
					await reader.context.request.fetch(`/api/v1${path}`, {
						method,
						data,
						headers: { 'content-type': 'application/json' }
					})
				).status(),
				path
			).toBe(403);
		}
		for (const [method, path, data] of [
			['PATCH', `/projects/${p.key}`, { name: 'Forbidden' }],
			['DELETE', `/projects/${p.key}`, undefined],
			['POST', `/projects/${p.key}/columns`, { name: 'Forbidden' }],
			['PATCH', `/projects/${p.key}/columns/${detail.columns[0].id}`, { name: 'Forbidden' }],
			['DELETE', `/projects/${p.key}/columns/${detail.columns[0].id}`, undefined],
			['POST', `/projects/${p.key}/tags`, { name: 'Forbidden' }],
			['PATCH', `/projects/${p.key}/tags/${tag.id}`, { name: 'Forbidden' }],
			['DELETE', `/projects/${p.key}/tags/${tag.id}`, undefined],
			['POST', `/projects/${p.key}/members`, { user: outsider.user.id, role: 'admin' }],
			['PATCH', `/projects/${p.key}/members/${reader.user.id}`, { role: 'admin' }],
			['DELETE', `/projects/${p.key}/members/${reader.user.id}`, undefined]
		] as const) {
			expect(
				(
					await member.context.request.fetch(`/api/v1${path}`, {
						method,
						data,
						headers: { 'content-type': 'application/json' }
					})
				).status(),
				path
			).toBe(403);
		}
		expect(
			(await member.context.request.patch(`/api/v1/tickets/${t.key}`, { data: { title: 'Allowed edit' } })).status()
		).toBe(200);
		expect(
			(
				await member.context.request.patch(`/api/v1/tickets/${t.key}`, { data: { assigneeId: outsider.user.id } })
			).status()
		).toBe(400);
		await api(request, 'DELETE', `/projects/${p.key}/members/${member.user.id}`);
		expect((await member.context.request.get(`/api/v1/tickets/${t.key}`)).status()).toBe(404);
		const visible = await member.context.request.get('/api/v1/projects');
		expect(await visible.json()).toEqual([]);
	} finally {
		await dispose([member.context, reader.context, outsider.context]);
	}
});

test('membership UI adds readers and exposes a read-only board and ticket view', async ({
	page,
	request,
	browser,
	baseURL
}) => {
	const reader = await register(browser, baseURL!, 'UI reader');
	try {
		await page.context().addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en', url: baseURL! }]);
		const p = await createProject(request, 'Membership UI');
		const t = await createTicket(request, p.key, { title: 'Read-only task' });
		await open(page, `/projects/${p.key}/members`);
		await page.getByLabel('Email', { exact: true }).fill(reader.user.email);
		await page.getByLabel('Role', { exact: true }).selectOption('reader');
		await page.getByRole('button', { name: 'Add member', exact: true }).click();
		const row = page.getByRole('row').filter({ hasText: reader.user.email });
		await expect(row).toBeVisible();
		const viewer = await reader.context.newPage();
		await open(viewer, `/projects/${p.key}/board`);
		await expect(
			viewer.getByRole('paragraph').filter({ hasText: 'You have read-only access to this project.' })
		).toBeVisible();
		await expect(viewer.getByRole('button', { name: 'Ticket', exact: true })).toBeDisabled();
		await expect(viewer.locator('[data-card]')).toHaveAttribute('draggable', 'false');
		await expect(viewer.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
		await open(viewer, `/tickets/${t.key}`);
		await expect(viewer.getByRole('textbox', { name: 'Title', exact: true })).toHaveAttribute('readonly', '');
		await expect(viewer.getByRole('button', { name: 'Complete', exact: true })).toBeDisabled();
		const forbidden = await reader.context.request.get(`/projects/${p.key}/settings`);
		expect(forbidden.status()).toBe(403);
		expect(await forbidden.text()).toContain('Insufficient project permissions.');
		await row.getByRole('combobox').selectOption('member');
		await expect(row.getByRole('combobox')).toHaveValue('member');
		await open(viewer, `/projects/${p.key}/board`);
		await expect(viewer.getByRole('button', { name: 'Ticket', exact: true })).toBeEnabled();
		await row.getByRole('button', { name: 'Remove', exact: true }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
		await expect(row).toHaveCount(0);
		await expect(page.getByRole('alertdialog')).toHaveCount(0);
		expect((await reader.context.request.get(`/tickets/${t.key}`)).status()).toBe(404);
	} finally {
		await reader.context.close();
	}
});

test('administration UI deactivates users and revokes browser sessions and personal tokens', async ({
	page,
	request,
	browser,
	baseURL
}) => {
	const target = await register(browser, baseURL!, 'Deactivation fixture');
	try {
		await page.context().addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en', url: baseURL! }]);
		const userPage = await target.context.newPage();
		await open(userPage, '/settings/api');
		await userPage.getByPlaceholder('Name, e.g. CI pipeline').fill('Revocation fixture');
		await userPage.getByRole('button', { name: 'Create token', exact: true }).click();
		const code = userPage.locator('code').filter({ hasText: /^kny_[A-Za-z0-9_-]+$/ });
		await expect(code).toBeVisible();
		const token = await code.innerText();
		const bearer = await browser.newContext({
			baseURL,
			storageState: { cookies: [], origins: [] },
			extraHTTPHeaders: { authorization: `Bearer ${token}` }
		});
		try {
			expect((await bearer.request.get('/api/v1/projects')).status()).toBe(200);
			const project = await createProject(request, 'Assignment history');
			await api(request, 'POST', `/projects/${project.key}/members`, { user: target.user.id, role: 'member' });
			const assigned = await createTicket(request, project.key, {
				title: 'Historical assignment',
				assigneeId: target.user.id
			});
			await open(page, '/admin/users');
			await page.getByRole('textbox', { name: 'Search by name or email' }).fill(target.user.email);
			const row = page.getByRole('row').filter({ hasText: target.user.email });
			await expect(row).toBeVisible();
			await row.getByRole('button', { name: 'Deactivate', exact: true }).click();
			await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate', exact: true }).click();
			await expect(row.getByText('Disabled', { exact: true })).toBeVisible();
			await expect(page.getByRole('alertdialog')).toHaveCount(0);
			expect((await target.context.request.get('/api/v1/projects')).status()).toBe(401);
			expect((await bearer.request.get('/api/v1/projects')).status()).toBe(401);
			const credentials = {
				headers: { origin: baseURL! },
				data: { email: target.user.email, password: 'permission-test-password' }
			};
			expect((await target.context.request.post('/api/auth/sign-in/email', credentials)).ok()).toBe(false);
			await row.getByRole('button', { name: 'Reactivate', exact: true }).click();
			await expect(row.getByText('Active', { exact: true })).toBeVisible();
			expect((await target.context.request.post('/api/auth/sign-in/email', credentials)).ok()).toBe(true);
			expect((await bearer.request.get('/api/v1/projects')).status()).toBe(401);
			expect((await request.patch('/api/v1/admin/users/missing', { data: { active: true } })).status()).toBe(404);
			await request.patch(`/api/v1/admin/users/${target.user.id}`, { data: { active: false } });
			await open(page, `/tickets/${assigned.key}`);
			await expect(page.getByRole('button', { name: 'Assignee: Deactivation fixture', exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Assignee: Deactivation fixture', exact: true })).toBeEnabled();
		} finally {
			await bearer.close();
		}
	} finally {
		await target.context.close();
	}
});
