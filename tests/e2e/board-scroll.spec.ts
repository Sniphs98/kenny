import { expect, test } from '@playwright/test';
import { createProject, createTicket, open } from './helpers';

test('Spalten-Scrollleiste erscheint beim Scrollen und blendet danach wieder aus', async ({ page, request }) => {
	const p = await createProject(request, 'Scrollen');
	for (let i = 1; i <= 20; i++) await createTicket(request, p.key, { title: `Aufgabe ${i}` });
	await open(page, `/projects/${p.key}/board`);
	const column = page.getByRole('region', { name: 'Offen', exact: true });
	await expect(column).toHaveClass(/scrollbar-soft/);
	expect(await column.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

	// In Ruhe unsichtbar (Daumenfarbe transparent)
	await page.mouse.move(5, 5);
	const thumb = () => column.evaluate((el) => getComputedStyle(el).getPropertyValue('--scrollbar-thumb').trim());
	await expect.poll(thumb).toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);

	// Scrollen ohne Maus darüber (z.B. Tastatur): kurz sichtbar, danach wieder aus
	await column.evaluate((el) => el.scrollBy(0, 200));
	await expect(column).toHaveAttribute('data-scrolling', '');
	await expect(column).not.toHaveAttribute('data-scrolling', { timeout: 3000 });
});
