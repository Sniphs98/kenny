import { expect, test } from '@playwright/test';
import { card, createProject, createTicket, day, open } from './helpers';

test('Esc schließt das Ticket-Modal auch bei offenem Tooltip mit einem Druck', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Tooltip im Modal' });
	await open(page, `/projects/${p.key}/board`);
	await card(page, 'Tooltip im Modal').getByRole('link', { name: 'Tooltip im Modal' }).click();

	const modal = page.getByRole('dialog');
	await expect(modal).toBeVisible();
	// Der automatische Fokus beim Öffnen zeigt keinen Tooltip
	await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);

	await modal.getByRole('link', { name: 'Als Seite öffnen' }).hover();
	await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('Als eigene Seite öffnen');

	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
	await expect(page).toHaveURL(`/projects/${p.key}/board`);
});

test('Gantt: Tooltip am Balken, beim Ziehen ausgeblendet; Einplan-Zeile zeigt ihn am Mauszeiger', async ({
	page,
	request
}) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Balken mit Tooltip', startDate: day(1), dueDate: day(6) });
	await open(page, `/projects/${p.key}/gantt`);
	const tooltip = page.locator('[data-slot="tooltip-content"]');

	const bar = page.locator('.bar').first();
	await bar.hover();
	await expect(tooltip).toContainText(`${t.key}: Balken mit Tooltip (${day(1)} bis ${day(6)})`);

	// Während des Ziehens ist der Tooltip weg
	const box = (await bar.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
	await expect(tooltip).toHaveCount(0);
	await page.mouse.up();

	// Breite Einplan-Zeile: Tooltip erscheint beim Mauszeiger, nicht mittig über der Zeile
	const plan = page.locator('.planrow');
	const planBox = (await plan.boundingBox())!;
	const x = planBox.x + 40;
	await page.mouse.move(x, planBox.y + planBox.height / 2);
	await expect(tooltip).toContainText('Klicken, um ein Ticket ab diesem Tag einzuplanen');
	const tipBox = (await tooltip.boundingBox())!;
	expect(Math.abs(tipBox.x + tipBox.width / 2 - x)).toBeLessThan(tipBox.width);
	expect(tipBox.x + tipBox.width / 2).toBeLessThan(planBox.x + planBox.width / 2);
});
