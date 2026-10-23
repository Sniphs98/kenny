import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { TEAMS_E2E } from './teams-env';
import { open } from './helpers';

const password = 'microsoft-link-test-12345';
const identity = {
	oid: 'bbbbbbbb-0000-4000-8000-000000000001',
	name: 'Microsoft Identity',
	email: 'different-microsoft-email@company.example',
	preferred_username: 'different-microsoft-email@company.example'
};

async function profile(request: APIRequestContext, claims: Record<string, unknown>, paused = false) {
	const response = await request.post(`${TEAMS_E2E.authority}/oauth-profile`, { data: { claims, paused } });
	expect(response.ok()).toBe(true);
}

async function login(page: Page, email: string) {
	await open(page, '/kenny/login');
	await page.getByLabel('E-Mail', { exact: true }).fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL('/kenny/');
}

async function post(request: APIRequestContext, path: string, data: Record<string, unknown>) {
	const response = await request.post(`/kenny/api/v1${path}`, {
		data,
		headers: { 'content-type': 'application/json' }
	});
	expect(response.ok(), await response.text()).toBe(true);
	return response.json();
}

test('existing users explicitly link a company identity and keep their account and permissions', async ({
	page,
	request,
	browser
}) => {
	test.slow(); // Several real OAuth redirects and independent account sessions are exercised.
	const anonymousLink = await request.post('/kenny/api/auth/link-social', {
		data: { provider: 'microsoft' },
		headers: { origin: 'http://localhost:4178' }
	});
	expect(anonymousLink.status()).toBe(401);
	// The isolated instance bootstraps one local administrator. Retries reuse that account.
	await open(page, '/kenny/login');
	if (await page.getByRole('link', { name: 'Registrieren', exact: true }).count()) {
		await page.getByRole('link', { name: 'Registrieren', exact: true }).click();
		await page.getByLabel('Name', { exact: true }).fill('Local Admin');
		await page.getByLabel('E-Mail', { exact: true }).fill('admin@local.example');
		await page.getByLabel('Passwort', { exact: true }).fill(password);
		await page.getByRole('button', { name: 'Registrieren', exact: true }).click();
		await expect(page).toHaveURL('/kenny/');
	} else await login(page, 'admin@local.example');

	const suffix = Date.now().toString(36);
	const email = `local-${suffix}@local.example`;
	const local = await post(page.request, '/admin/users', { name: 'Existing Kenny User', email, password });
	const otherEmail = `other-${suffix}@local.example`;
	await post(page.request, '/admin/users', { name: 'Other Kenny User', email: otherEmail, password });
	const project = await post(page.request, '/projects', { name: 'Existing project', key: `M${suffix.toUpperCase()}` });
	await post(page.request, `/projects/${project.key}/members`, { user: email, role: 'member' });
	const ticket = await post(page.request, `/projects/${project.key}/tickets`, {
		title: 'Existing assignment',
		assignees: [email]
	});
	const context = await browser.newContext({ baseURL: 'http://localhost:4178', locale: 'de-DE' });
	try {
		const member = await context.newPage();
		await login(member, email);
		const before = await (await member.request.get('/kenny/api/v1/me')).json();
		// Even a provider-verified matching email must not implicitly attach a Microsoft identity.
		await profile(request, { ...identity, email, email_verified: true });
		await member.request.post('/kenny/api/auth/sign-out', { data: {}, headers: { origin: 'http://localhost:4178' } });
		await open(member, '/kenny/login');
		await member.getByRole('button', { name: /Mit Microsoft anmelden/ }).click();
		await expect(member).toHaveURL(/\/kenny\/login\?error=/);
		await login(member, email);
		await member.getByRole('button', { name: /Benutzermenü/ }).click();
		await member.getByRole('menuitem', { name: 'Kontoeinstellungen', exact: true }).click();
		await expect(member).toHaveURL('/kenny/settings/account');
		await expect(member.getByRole('button', { name: 'Microsoft-Konto verbinden' })).toBeVisible();

		// Validly signed foreign-tenant tokens still cannot be linked.
		await profile(request, {
			...identity,
			tid: '22222222-2222-4222-8222-222222222222',
			iss: `${TEAMS_E2E.authority}/22222222-2222-4222-8222-222222222222/v2.0`
		});
		await member.getByRole('button', { name: 'Microsoft-Konto verbinden' }).click();
		await expect(member).toHaveURL(/\/kenny\/settings\/account\?error=/);
		await expect(member.getByRole('alert')).toBeVisible();

		// A signed link state cannot be completed after logging out of the initiating account.
		await profile(
			request,
			{ ...identity, oid: `bbbbbbbb-0000-4000-8000-${suffix.padStart(12, '0').replace(/[^0-9a-f]/g, 'a')}` },
			true
		);
		await member.getByRole('button', { name: 'Microsoft-Konto verbinden' }).click();
		await expect(member).toHaveURL(/\/oauth2\/v2\.0\/authorize/);
		const callback = await member.locator('body').innerText();
		const { callback: callbackURL } = JSON.parse(callback);
		await member.request.post('/kenny/api/auth/sign-out', { data: {}, headers: { origin: 'http://localhost:4178' } });
		await member.goto(callbackURL);
		await login(member, email);
		await open(member, '/kenny/settings/account');
		await expect(member.getByRole('button', { name: 'Microsoft-Konto verbinden' })).toBeVisible();

		// Deactivation while Microsoft is open revokes the initiating session and prevents attachment.
		await profile(
			request,
			{ ...identity, oid: `dddddddd-0000-4000-8000-${suffix.padStart(12, '0').replace(/[^0-9a-f]/g, 'a')}` },
			true
		);
		await member.getByRole('button', { name: 'Microsoft-Konto verbinden' }).click();
		await expect(member).toHaveURL(/\/oauth2\/v2\.0\/authorize/);
		const disabledCallback = JSON.parse(await member.locator('body').innerText()).callback;
		expect(
			(
				await page.request.patch(`/kenny/api/v1/admin/users/${local.id}`, {
					data: { active: false },
					headers: { 'content-type': 'application/json' }
				})
			).ok()
		).toBe(true);
		await member.goto(disabledCallback);
		await expect(member).toHaveURL(/\/kenny\/login/);
		expect((await member.request.get('/kenny/api/v1/me')).status()).toBe(401);
		expect(
			(
				await page.request.patch(`/kenny/api/v1/admin/users/${local.id}`, {
					data: { active: true },
					headers: { 'content-type': 'application/json' }
				})
			).ok()
		).toBe(true);
		await login(member, email);
		await open(member, '/kenny/settings/account');
		await expect(member.getByRole('button', { name: 'Microsoft-Konto verbinden' })).toBeVisible();

		// Explicit linking permits different emails without changing the local account's identity.
		const linkedIdentity = {
			...identity,
			oid: `cccccccc-0000-4000-8000-${suffix.padStart(12, '0').replace(/[^0-9a-f]/g, 'a')}`
		};
		await profile(request, linkedIdentity);
		await member.getByRole('button', { name: 'Microsoft-Konto verbinden' }).click();
		await expect(member.getByRole('status')).toHaveText('Microsoft-Konto verbunden');
		await expect(member.getByRole('button', { name: 'Microsoft-Konto verbinden' })).toHaveCount(0);
		await member.request.post('/kenny/api/auth/sign-out', { data: {}, headers: { origin: 'http://localhost:4178' } });
		await open(member, '/kenny/login');
		await member.getByRole('button', { name: /Mit Microsoft anmelden/ }).click();
		await expect(member).toHaveURL('/kenny/');
		const after = await (await member.request.get('/kenny/api/v1/me')).json();
		expect(after).toEqual(before);
		expect(after.id).toBe(local.id);
		const visible = await (await member.request.get('/kenny/api/v1/projects')).json();
		expect(visible).toEqual(expect.arrayContaining([expect.objectContaining({ id: project.id })]));
		const assigned = await (await member.request.get(`/kenny/api/v1/tickets/${ticket.key}`)).json();
		expect(assigned.assigneeIds).toContain(local.id);
		expect((await member.request.get('/kenny/api/v1/admin/users')).status()).toBe(403);

		// The same Microsoft identity cannot be claimed by another existing Kenny user.
		await member.request.post('/kenny/api/auth/sign-out', { data: {}, headers: { origin: 'http://localhost:4178' } });
		await login(member, otherEmail);
		await open(member, '/kenny/settings/account');
		await member.getByRole('button', { name: 'Microsoft-Konto verbinden' }).click();
		await expect(member).toHaveURL(/\/kenny\/settings\/account\?error=/);
		await expect(member.getByRole('alert')).toBeVisible();
		await expect(member.getByRole('button', { name: 'Microsoft-Konto verbinden' })).toBeVisible();
		await member.request.post('/kenny/api/auth/sign-out', { data: {}, headers: { origin: 'http://localhost:4178' } });
		await login(member, email);
		expect(await (await member.request.get('/kenny/api/v1/me')).json()).toEqual(before);
	} finally {
		await context.close();
	}
});
