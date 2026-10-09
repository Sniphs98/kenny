import { test, expect } from '@playwright/test';
import { open, reload } from './helpers';

test('language switch persists across reloads and translates the project and ticket workflow', async ({ page }) => {
	await open(page, '/');
	await expect(page.getByRole('heading', { name: 'Projekte', exact: true })).toBeVisible();
	await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
	await reload(page);
	await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('en');

	await page.getByRole('button', { name: 'New project', exact: true }).click();
	await page.getByLabel('Name', { exact: true }).fill('English localization');
	const key = `I${Date.now().toString(36).toUpperCase()}`;
	await page.getByLabel('Key', { exact: true }).fill(key);
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/projects/${key}/board`));
	await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Ticket', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'New ticket' })).toBeVisible();
	await dialog.getByLabel('Title', { exact: true }).fill('User content stays unchanged');
	await expect(dialog.getByText('Medium', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await page.getByRole('link', { name: 'User content stays unchanged', exact: true }).click();
	await expect(page.getByText('No description.', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete ticket', exact: true })).toBeVisible();
	await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('button', { name: 'Ticket löschen', exact: true })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue('User content stays unchanged');
});

test('login SSR uses each request cookie and falls back to German for unknown locales', async ({ request }) => {
	const responses = await Promise.all(
		['en', 'de', 'fr'].map((locale) => request.get('/login', { headers: { cookie: `PARAGLIDE_LOCALE=${locale}` } }))
	);
	for (const [index, response] of responses.entries()) {
		expect(response.ok()).toBeTruthy();
		const html = await response.text();
		expect(html).toContain(`lang="${index === 0 ? 'en' : 'de'}"`);
		expect(html).toContain(index === 0 ? 'Welcome back' : 'Willkommen zurück');
	}
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
