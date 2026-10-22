import { expect, test, type Page } from '@playwright/test';
import { createProject, createTicket, open } from './helpers';

async function cardTitles(page: Page, region: string) {
	const cards = page.getByRole('region', { name: region, exact: true }).locator('[data-card]');
	await expect(cards.first()).toBeVisible();
	return cards.evaluateAll((els) => els.map((el) => el.querySelector('a.line-clamp-3')?.textContent?.trim()));
}

test('einzelne Spalte abweichend sortieren', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Zebra' });
	await createTicket(request, p.key, { title: 'Affe' });

	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Spalte Offen sortieren' }).click();
	await page.getByRole('menuitemradio', { name: 'Titel A–Z' }).click();
	expect(await cardTitles(page, 'Allgemein: Offen')).toEqual(['Affe', 'Zebra']);
	await expect(page.getByRole('button', { name: 'Spalte Offen sortieren' })).toContainText('Titel A–Z');
});
