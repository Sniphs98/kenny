import { expect, test } from '@playwright/test';
import { projectSchema, ticketDtoSchema } from '../../src/lib/contracts/index';
import { open } from './helpers';

test('runtime subpath supports client links, command navigation and shallow ticket routing', async ({
	page,
	baseURL
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await open(page, '/kenny/login');
	const register = page.getByRole('link', { name: 'Registrieren', exact: true });
	if (await register.count()) {
		await register.click();
		await page.getByLabel('Name', { exact: true }).fill('Subpath Tester');
		await page.getByLabel('E-Mail', { exact: true }).fill('subpath@example.com');
		await page.getByLabel('Passwort', { exact: true }).fill('subpath-test-12345');
		await page.getByRole('button', { name: 'Registrieren', exact: true }).click();
	} else {
		// CI retries reuse the isolated server after the first administrator has registered.
		await page.getByLabel('E-Mail', { exact: true }).fill('subpath@example.com');
		await page.getByLabel('Passwort', { exact: true }).fill('subpath-test-12345');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	}
	await expect(page).toHaveURL('/kenny/');

	const key = `S${Date.now().toString(36).toUpperCase()}`;
	const projectResponse = await page.request.post('/kenny/api/v1/projects', {
		data: { name: `Subpath ${key}`, key },
		headers: { 'content-type': 'application/json' }
	});
	expect(projectResponse.status()).toBe(201);
	const project = projectSchema.parse(await projectResponse.json());
	const ticketResponse = await page.request.post(`/kenny/api/v1/projects/${project.key}/tickets`, {
		data: { title: `Subpath ticket ${key}` },
		headers: { 'content-type': 'application/json' }
	});
	expect(ticketResponse.status()).toBe(201);
	const ticket = ticketDtoSchema.parse(await ticketResponse.json());
	await open(page, '/kenny/');

	// A document marker distinguishes client routing from a server fallback/full reload.
	await page.locator('html').evaluate((html) => (html.dataset.subpathNavigation = 'preserved'));
	const boardPath = `/kenny/projects/${project.key}/board`;
	const ticketPath = `/kenny/tickets/${ticket.key}`;
	await page.locator(`a[href="${boardPath}"]`).click();
	await expect(page).toHaveURL(boardPath);
	await expect(page.locator('html')).toHaveAttribute('data-subpath-navigation', 'preserved');

	await page.locator('[data-card]').filter({ hasText: ticket.title }).locator(`a[href="${ticketPath}"]`).click();
	await expect(page).toHaveURL(ticketPath);
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-subpath-navigation', 'preserved');
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(boardPath);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Suchen und Befehle' });
	await expect(palette).toBeVisible();
	await page.keyboard.type('einstellungen');
	await palette.getByRole('option').filter({ hasText: 'Einstellungen' }).click();
	await expect(page).toHaveURL(`/kenny/projects/${project.key}/settings`);
	await expect(page.locator('html')).toHaveAttribute('data-subpath-navigation', 'preserved');

	await expect(palette).toHaveCount(0);
	await page.keyboard.press('Control+k');
	await expect(palette).toBeVisible();
	await page.keyboard.type(ticket.title);
	await palette.getByRole('option').filter({ hasText: ticket.title }).click();
	await expect(page).toHaveURL(ticketPath);
	await expect(page.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(ticket.title);
	await expect(page.locator('html')).toHaveAttribute('data-subpath-navigation', 'preserved');

	// The same ticket must also work when loaded directly from the production server.
	await open(page, ticketPath);
	await expect(page.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(ticket.title);
	expect(new URL(page.url()).origin).toBe(baseURL);
	expect(errors).toEqual([]);
});
