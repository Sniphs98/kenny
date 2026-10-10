import { expect, test } from '@playwright/test';
import { createProject, createTicket, open } from './helpers';

test('Theme-Umschalter ist eine abgerundete Button-Gruppe und schaltet das Theme', async ({ page }) => {
	await open(page, '/');
	const group = page.getByRole('group', { name: 'Darstellung' });
	const items = group.getByRole('radio');
	await expect(items).toHaveCount(3);

	// Äußere Ecken gerundet, innere Kanten gerade (zusammenhängende Gruppe)
	const radius = (index: number, corner: 'borderTopLeftRadius' | 'borderTopRightRadius') =>
		items.nth(index).evaluate((el, c) => parseFloat(getComputedStyle(el)[c]), corner);
	expect(await radius(0, 'borderTopLeftRadius')).toBeGreaterThan(0);
	expect(await radius(2, 'borderTopRightRadius')).toBeGreaterThan(0);
	expect(await radius(0, 'borderTopRightRadius')).toBe(0);

	await items.nth(2).click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await items.nth(1).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('Trennlinie im Ticket ist sichtbar', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Trennlinie prüfen' });
	await open(page, `/tickets/${t.key}`);
	const separator = page.locator('[data-slot="separator"]').first();
	const box = await separator.boundingBox();
	expect(box?.height).toBe(1);
	expect(box?.width).toBeGreaterThan(100);
});

test('Dark Mode: neutrale Flächen, hellere Karten und lesbarer Text', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Dark-Mode-Kontrast' });
	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('group', { name: 'Darstellung' }).getByRole('radio').nth(2).click();
	await expect(page.locator('html')).toHaveClass(/dark/);

	const colors = await page
		.locator('[data-card]')
		.first()
		.evaluate((card) => {
			const column = card.closest('section')!;
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext('2d')!;
			const sample = (...layers: string[]) => {
				ctx.clearRect(0, 0, 1, 1);
				for (const layer of layers) {
					ctx.fillStyle = layer;
					ctx.fillRect(0, 0, 1, 1);
				}
				return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
			};
			const background = getComputedStyle(document.body).backgroundColor;
			const columnBackground = getComputedStyle(column).backgroundColor;
			const cardStyle = getComputedStyle(card);
			return {
				background: sample(background),
				column: sample(background, columnBackground),
				card: sample(background, columnBackground, cardStyle.backgroundColor),
				text: sample(cardStyle.color),
				mutedText: sample(getComputedStyle(card.querySelector('.text-muted-foreground')!).color)
			};
		});
	const luminance = (rgb: number[]) => {
		const linear = rgb.map((channel) => {
			const value = channel / 255;
			return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
		});
		return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
	};
	for (const rgb of Object.values(colors)) expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThanOrEqual(1);
	expect(luminance(colors.column)).toBeGreaterThan(luminance(colors.background));
	expect(luminance(colors.card)).toBeGreaterThan(luminance(colors.column));
	for (const text of [colors.text, colors.mutedText]) {
		expect((luminance(text) + 0.05) / (luminance(colors.card) + 0.05)).toBeGreaterThanOrEqual(4.5);
	}

	await page.getByRole('group', { name: 'Darstellung' }).getByRole('radio').nth(1).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('Ticket: Beschreibung und Seitenleiste beginnen auf gleicher Höhe', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Bündig' });

	const tops = async (scope: ReturnType<typeof page.locator>) => {
		const description = scope.locator('[data-slot="card"]').filter({ hasText: 'Beschreibung' }).first();
		const sidebar = scope
			.locator('[data-slot="card"]')
			.filter({ has: page.getByRole('button', { name: 'Abschließen' }) });
		return [(await description.boundingBox())!.y, (await sidebar.boundingBox())!.y];
	};

	await open(page, `/tickets/${t.key}`);
	const [descPage, sidePage] = await tops(page.locator('main'));
	expect(Math.abs(descPage - sidePage)).toBeLessThan(1);

	await open(page, `/projects/${p.key}/board`);
	await page.locator('[data-card]').filter({ hasText: 'Bündig' }).getByRole('link', { name: 'Bündig' }).click();
	const modal = page.getByRole('dialog');
	await expect(modal).toBeVisible();
	const [descModal, sideModal] = await tops(modal);
	expect(Math.abs(descModal - sideModal)).toBeLessThan(1);
});
