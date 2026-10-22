import { expect, test } from '@playwright/test';
import { card, createProject, createTicket, open } from './helpers';

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
