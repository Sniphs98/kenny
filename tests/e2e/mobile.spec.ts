import { expect, test, type Page } from '@playwright/test';
import { api, card, createProject, createTicket, day, getTicket, open } from './helpers';

async function fitsViewport(page: Page) {
	const size = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: visualViewport?.width ?? innerWidth
	}));
	expect(size.width, page.url()).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
	expect(size.viewport, page.url()).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

for (const width of [320, 375, 430, 768]) {
	test(`pages fit a ${width}px touch viewport with long content`, async ({ page, request }) => {
		await page.setViewportSize({ width, height: 812 });
		const p = await createProject(request, 'Mobile ' + 'LongProjectName'.repeat(6));
		const t = await createTicket(request, p.key, {
			title: 'Touch task ' + 'LongTitle'.repeat(16),
			description: 'https://example.com/' + 'long-path'.repeat(60),
			startDate: day(0),
			dueDate: day(5)
		});
		for (const path of [
			'/',
			`/projects/${p.key}/board`,
			`/projects/${p.key}/gantt`,
			`/projects/${p.key}/settings`,
			`/projects/${p.key}/members`,
			`/tickets/${t.key}`,
			'/admin/users',
			'/settings/forms',
			'/settings/api'
		]) {
			await open(page, path);
			await fitsViewport(page);
		}
	});
}

test('touch navigation, board status change and full-screen ticket editing', async ({ page, request }) => {
	const p = await createProject(request, 'Touch workflow');
	const t = await createTicket(request, p.key, { title: 'Edit by touch' });
	await open(page, '/');
	await page
		.getByRole('link')
		.filter({ hasText: `Touch workflow ${p.key}` })
		.tap();
	await expect(page).toHaveURL(`/projects/${p.key}/board`);
	await card(page, t.title).getByRole('button', { name: 'Ticket verschieben' }).tap();
	await page.getByRole('menuitem', { name: 'Review', exact: true }).tap();
	await expect.poll(async () => (await getTicket(request, t.key)).status).toBe('Review');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await card(page, t.title).getByRole('link', { name: t.title, exact: true }).tap();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const bounds = await dialog.boundingBox();
	expect(bounds?.width).toBe(375);
	expect(bounds?.x).toBe(0);
	await dialog.getByRole('textbox', { name: 'Titel', exact: true }).fill('Saved on mobile');
	await dialog.getByRole('textbox', { name: 'Titel', exact: true }).press('Enter');
	await expect.poll(async () => (await getTicket(request, t.key)).title).toBe('Saved on mobile');
	const dates = dialog.locator('input[type=date]');
	await expect(dates).toHaveCount(2);
	await dates.first().fill(day(1));
	await expect.poll(async () => (await getTicket(request, t.key)).startDate).toBe(day(1));
	await expect(dates.last()).toHaveAttribute('min', day(1));
	await dates.last().fill(day(3));
	await expect.poll(async () => (await getTicket(request, t.key)).dueDate).toBe(day(3));
	await dates.last().fill(day(0));
	await expect(dates.last()).toHaveValue(day(3));
	expect((await getTicket(request, t.key)).dueDate).toBe(day(3));
	await dialog.getByRole('button', { name: 'Schließen', exact: true }).tap();
	await expect(dialog).toBeHidden();
	await page.getByRole('navigation', { name: 'Projektnavigation' }).getByRole('link', { name: 'Gantt' }).tap();
	await expect(page.locator('.labels .label').filter({ hasText: 'Saved on mobile' })).toBeVisible();
	const chart = page.locator('.gantt');
	const labelWidth = await page.locator('.gantt .corner').evaluate((el) => el.getBoundingClientRect().width);
	expect(labelWidth).toBeLessThan(200);
	await chart.evaluate((el) => {
		el.scrollLeft += 100;
	});
	await fitsViewport(page);
	await page.getByRole('button', { name: 'Ticket einplanen…', exact: true }).tap();
	const planner = page.locator('[data-slot=popover-content]');
	await expect(planner).toBeVisible();
	const plannerBounds = await planner.boundingBox();
	expect(plannerBounds!.width).toBeLessThanOrEqual(375 - 32);
	expect(plannerBounds!.x).toBeGreaterThanOrEqual(0);
	expect(plannerBounds!.x + plannerBounds!.width).toBeLessThanOrEqual(375);
	await fitsViewport(page);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Benutzermenü' }).tap();
	await expect(page.getByRole('menuitem', { name: 'Abmelden' })).toBeVisible();
});

test('long create dialogs scroll and project columns can be reordered by touch', async ({ page, request }) => {
	const p = await createProject(request, 'Mobile settings');
	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Ticket', exact: true }).tap();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Titel', { exact: true }).fill('Created on a phone');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).tap();
	await expect(dialog).toBeHidden();
	await expect(card(page, 'Created on a phone')).toBeVisible();
	await page.getByRole('navigation', { name: 'Projektnavigation' }).getByRole('link', { name: 'Einstellungen' }).tap();
	await page.getByRole('button', { name: 'In Arbeit nach oben verschieben', exact: true }).tap();
	await expect
		.poll(async () => {
			const project = await api<{ columns: { name: string }[] }>(request, 'GET', `/projects/${p.key}`);
			return project.columns[0].name;
		})
		.toBe('In Arbeit');
	await fitsViewport(page);
});

test('mobile readers can view tickets but cannot use touch editing controls', async ({ browser, request, baseURL }) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 375, height: 812 },
		isMobile: true,
		hasTouch: true,
		locale: 'de-DE',
		storageState: { cookies: [], origins: [] }
	});
	try {
		const signup = await context.request.post('/api/auth/sign-up/email', {
			headers: { origin: baseURL! },
			data: {
				name: 'Mobile reader',
				email: `mobile-reader-${Date.now()}@example.com`,
				password: 'mobile-reader-password'
			}
		});
		expect(signup.ok()).toBeTruthy();
		const { user } = await signup.json();
		const p = await createProject(request, 'Mobile read-only');
		const t = await createTicket(request, p.key, { title: 'Read-only touch ticket' });
		await api(request, 'POST', `/projects/${p.key}/members`, { user: user.id, role: 'reader' });
		const page = await context.newPage();
		await open(page, `/projects/${p.key}/board`);
		await expect(page.getByRole('button', { name: 'Ticket verschieben' })).toHaveCount(0);
		await card(page, t.title).getByRole('link', { name: t.title, exact: true }).tap();
		await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Titel', exact: true })).toHaveAttribute(
			'readonly',
			''
		);
		const dates = page.getByRole('dialog').locator('input[type=date]');
		await expect(dates).toHaveCount(2);
		await expect(dates.first()).toBeDisabled();
		await expect(dates.last()).toBeDisabled();
		expect((await context.request.patch(`/api/v1/tickets/${t.key}`, { data: { column: 'Review' } })).status()).toBe(
			403
		);
	} finally {
		await context.close();
	}
});
