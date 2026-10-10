import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { TEAMS_E2E } from './teams-env';

// Die Tests bauen aufeinander auf: der erste Teams-Nutzer wird Administrator und legt das Projekt an
test.describe.configure({ mode: 'serial' });

const tina = {
	oid: 'aaaaaaaa-0000-4000-8000-000000000001',
	name: 'Tina Teams',
	preferred_username: 'tina@firma.example'
};

/** Von Entra ID signiertes Teams-SSO-Token (nachgebaut); claims überschreiben die Standardwerte */
async function teamsToken(request: APIRequestContext, claims: Record<string, unknown> = {}) {
	const response = await request.post(`${TEAMS_E2E.authority}/token`, {
		data: {
			iss: `${TEAMS_E2E.authority}/${TEAMS_E2E.tenant}/v2.0`,
			tid: TEAMS_E2E.tenant,
			aud: TEAMS_E2E.clientId,
			scp: 'access_as_user',
			...tina,
			...claims
		}
	});
	return ((await response.json()) as { token: string }).token;
}

/**
 * Nachgebautes Teams: Playwright liefert unter https://teams.microsoft.com eine Seite aus, die Kenny
 * im iframe zeigt und die Nachrichten des Teams-SDK beantwortet. Für den Browser ist Kenny damit ein
 * echtes Drittanbieter-iframe (Cookies, Framing-Header, CSRF wie in Teams).
 */
async function openInTeams(page: Page, path: string, token: string, frameContext: 'content' | 'settings' = 'content') {
	const host = `<!doctype html><html><body style="margin:0">
<iframe src="${TEAMS_E2E.url}${path}" style="width:100vw;height:100vh;border:0"></iframe>
<script>
	window.kenny = { settings: null, valid: null };
	addEventListener('message', (e) => {
		const d = e.data;
		if (!d || typeof d.func !== 'string' || typeof d.id !== 'number') return;
		if (d.func === 'settings.setSettings') window.kenny.settings = d.args[0];
		if (d.func === 'settings.setValidityState') window.kenny.valid = d.args[0];
		const answers = {
			initialize: [${JSON.stringify(frameContext)}, 'web', '2.0.0', '2.0.0'],
			getContext: [{ theme: 'default', locale: 'de-de', frameContext: ${JSON.stringify(frameContext)} }],
			'authentication.getAuthToken': [true, ${JSON.stringify(token)}],
			'settings.setSettings': [true]
		};
		e.source.postMessage({ id: d.id, uuidAsString: d.uuidAsString, args: answers[d.func] || [] }, e.origin);
	});
	// „Speichern“ im Teams-Dialog für Kanal-Tabs
	window.kennySave = () => document.querySelector('iframe').contentWindow.postMessage({ func: 'settings.save', args: [{}] }, '*');
</script></body></html>`;
	// Chrome fragt, bevor eine öffentliche Seite Geräte im lokalen Netz lädt (hier: Kenny auf localhost)
	await page.context().grantPermissions(['local-network-access'], { origin: 'https://teams.microsoft.com' });
	// Keine echten Microsoft-Dienste: nur die nachgebaute Teams-Seite ist erreichbar
	await page.unrouteAll();
	await page.route(/^https:\/\//, (route) =>
		route.request().url().startsWith('https://teams.microsoft.com/')
			? route.fulfill({ contentType: 'text/html', body: host })
			: route.abort()
	);
	await page.goto('https://teams.microsoft.com/l/kenny');
	const frame = page.frameLocator('iframe');
	return frame;
}

test('Persönlicher Tab: Teams-SSO meldet automatisch an, Formulare funktionieren im iframe', async ({
	page,
	request
}) => {
	const frame = await openInTeams(page, '/teams?to=%2F', await teamsToken(request));
	// Erster Nutzer der Instanz: angemeldet und Administrator, Konto aus dem Teams-Token
	await expect(frame.getByRole('button', { name: 'Neues Projekt' })).toBeVisible();
	await expect(frame.getByRole('button', { name: 'Benutzermenü' })).toContainText('Tina Teams');
	await expect(frame.locator('html[data-hydrated]')).toBeAttached();

	// Projekt über das normale Formular anlegen (Session-Cookie und CSRF-Prüfung im Drittanbieter-iframe)
	await frame.getByRole('button', { name: 'Neues Projekt' }).click();
	await frame.getByRole('dialog').getByLabel('Name').fill('Teams Board');
	await frame.getByRole('dialog').getByLabel('Kürzel').fill('TMS');
	await frame.getByRole('dialog').getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(frame.getByRole('heading', { name: 'Teams Board' })).toBeVisible();

	// Sitzung nur für Kenny in Teams: SameSite=None, Secure und partitioniert unter dem Teams-Host
	const session = (await page.context().cookies(TEAMS_E2E.url)).find((c) => c.name.endsWith('session_token'));
	expect(session).toMatchObject({ sameSite: 'None', secure: true, httpOnly: true });
	expect(session?.partitionKey).toBe('https://microsoft.com');
});

test('Kanal-Tab: Projekt wählen, Teams speichert die Board-Adresse', async ({ page, request }) => {
	const frame = await openInTeams(page, '/teams/config', await teamsToken(request), 'settings');
	await expect(frame.getByText('Kenny-Tab einrichten')).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { kenny: { valid: boolean } }).kenny.valid))
		.toBe(false);

	await frame.getByLabel('Projekt').click();
	await frame.getByRole('option', { name: 'Teams Board' }).click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { kenny: { valid: boolean } }).kenny.valid))
		.toBe(true);
	await page.evaluate(() => (window as unknown as { kennySave: () => void }).kennySave());
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { kenny: { settings: unknown } }).kenny.settings))
		.toEqual({
			entityId: 'kenny-project-TMS',
			contentUrl: `${TEAMS_E2E.url}/teams?to=%2Fprojects%2FTMS%2Fboard`,
			websiteUrl: `${TEAMS_E2E.url}/projects/TMS/board`,
			suggestedDisplayName: 'Kenny · Teams Board'
		});

	// Der gespeicherte Tab öffnet direkt das Board
	const tab = await openInTeams(page, '/teams?to=%2Fprojects%2FTMS%2Fboard', await teamsToken(request));
	await expect(tab.getByRole('heading', { name: 'Teams Board' })).toBeVisible();
	await expect(tab.getByRole('navigation', { name: 'Projektnavigation' })).toBeVisible();
});

test('Administration: Einrichtungswerte und App-Paket', async ({ page, request }) => {
	const frame = await openInTeams(page, '/teams?to=%2Fadmin%2Fteams', await teamsToken(request));
	await expect(frame.getByRole('heading', { name: 'Microsoft Teams' })).toBeVisible();
	await expect(frame.locator('[data-teams-entra]')).toContainText(`api://localhost:4175/${TEAMS_E2E.clientId}`);
	await expect(frame.locator('[data-teams-entra]')).toContainText('1fec8e78-bce4-4aaf-ab1b-5451cc387264');
	// Test-Instanz läuft ohne HTTPS: genau dieser Punkt fehlt
	await expect(frame.locator('[data-teams-status] li').filter({ hasText: 'HTTPS' })).toContainText('Fehlt');
	await expect(frame.locator('[data-teams-status] li').filter({ hasText: 'TEAMS_ENABLED' })).toContainText('OK');

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		frame.getByRole('button', { name: 'App-Paket herunterladen' }).click()
	]);
	expect(download.suggestedFilename()).toBe('kenny-teams.zip');
	const archive = readFileSync((await download.path())!);
	const manifest = archive.toString('utf8', 0, archive.length);
	expect(manifest).toContain('"manifestVersion": "1.19"');
	expect(manifest).toContain(`"resource": "api://localhost:4175/${TEAMS_E2E.clientId}"`);
});

test('Nur echte Tokens aus dem eigenen Tenant für Kenny werden angenommen', async ({ request }) => {
	const signIn = async (token: string) =>
		(
			await request.post('/api/auth/sign-in/social', {
				headers: { origin: TEAMS_E2E.url },
				data: { provider: 'microsoft', idToken: { token } }
			})
		).status();

	const otherTenant = '22222222-2222-4222-8222-222222222222';
	expect(await signIn(await teamsToken(request, { aud: 'some-other-app' }))).toBe(401);
	expect(
		await signIn(await teamsToken(request, { tid: otherTenant, iss: `${TEAMS_E2E.authority}/${otherTenant}/v2.0` }))
	).toBe(401);
	expect(await signIn(await teamsToken(request, { exp: Math.floor(Date.now() / 1000) - 60 }))).toBe(401);
	expect(await signIn(`${(await teamsToken(request)).slice(0, -4)}AAAA`)).toBe(401);
	expect(await signIn(await teamsToken(request))).toBe(200);
});

test('Außerhalb von Teams: Hinweis statt Anmeldung, Framing nur für Teams-Hosts', async ({ page, request }) => {
	await page.goto('/teams');
	await expect(page.getByRole('heading', { name: 'Diese Seite ist für Microsoft Teams gedacht' })).toBeVisible();

	const login = await request.get('/login');
	expect(login.headers()['x-frame-options']).toBeUndefined();
	expect(login.headers()['content-security-policy']).toContain("frame-ancestors 'self' https://teams.microsoft.com");
	expect(login.headers()['content-security-policy']).not.toContain('*;');
});
