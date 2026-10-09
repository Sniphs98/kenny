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
