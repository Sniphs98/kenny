import { test, expect, type Page } from '@playwright/test';
import { open } from './helpers';

/** Sprache über das Untermenü im Benutzermenü wählen */
async function chooseLanguage(page: Page, submenu: string, option: string) {
	await page.getByRole('button', { name: /Erika Test/ }).click();
	await page.getByRole('menuitem', { name: submenu }).click();
	await page.getByRole('menuitemradio', { name: option }).click();
}

test('system language removes the stored choice', async ({ page }) => {
	await open(page, '/');
	await chooseLanguage(page, 'Sprache', 'English');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await chooseLanguage(page, 'Language', 'System language');
	// Zurück zur Browsersprache (de-DE), ohne gespeicherte Wahl
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	expect((await page.context().cookies()).some((c) => c.name === 'PARAGLIDE_LOCALE')).toBe(false);
});

test.describe('without session', () => {
	// Sonst schickt der Request-Kontext die Sitzung mit und /login leitet auf die Projektübersicht weiter
	test.use({ storageState: { cookies: [], origins: [] } });

	test('login SSR uses the stored choice, then the system language, then English', async ({ request }) => {
		const cases: { headers: Record<string, string>; lang: 'de' | 'en' }[] = [
			{ headers: { cookie: 'PARAGLIDE_LOCALE=en', 'accept-language': 'de-DE' }, lang: 'en' },
			{ headers: { cookie: 'PARAGLIDE_LOCALE=de', 'accept-language': 'en-US' }, lang: 'de' },
			// Unbekannte gespeicherte Sprache: weiter mit der Systemsprache
			{ headers: { cookie: 'PARAGLIDE_LOCALE=fr', 'accept-language': 'de-DE,de;q=0.9' }, lang: 'de' },
			{ headers: { 'accept-language': 'de-AT,en;q=0.5' }, lang: 'de' },
			// Nicht unterstützte Systemsprache: Englisch
			{ headers: { 'accept-language': 'fr-FR,fr;q=0.9' }, lang: 'en' }
		];
		const responses = await Promise.all(cases.map(({ headers }) => request.get('/login', { headers })));
		for (const [index, response] of responses.entries()) {
			const { headers, lang } = cases[index];
			expect(response.ok()).toBeTruthy();
			const html = await response.text();
			expect(html, JSON.stringify(headers)).toContain(`lang="${lang}"`);
			expect(html).toContain(lang === 'en' ? 'Welcome back' : 'Willkommen zurück');
		}
	});
});

test('English API errors preserve their status and field identifiers', async ({ request }) => {
	const response = await request.post('/api/v1/projects', {
		headers: { cookie: 'PARAGLIDE_LOCALE=en' },
		data: { name: 'Unauthorized' }
	});
	expect(response.status()).toBe(401);
	const body = await response.json();
	expect(body.error).toBe('Not signed in. Send an API token as a bearer token.');
});
