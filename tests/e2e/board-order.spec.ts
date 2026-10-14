import { expect, test, type Page } from '@playwright/test';
import { api, card, choose, createProject, createTicket, getTicket, open, reload } from './helpers';

async function cardTitles(page: Page, region: string) {
	const cards = page.getByRole('region', { name: region, exact: true }).locator('[data-card]');
	await expect(cards.first()).toBeVisible();
	return cards.evaluateAll((els) => els.map((el) => el.querySelector('a.line-clamp-3')?.textContent?.trim()));
}

/** Spalte samt freiem Platz unter den Karten */
const column = (page: Page, name: string) =>
	page.locator('[data-dropzone]').filter({ has: page.getByRole('region', { name, exact: true }) });

test('Karte lässt sich auf den freien Platz unter einer Spalte ziehen', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Nach unten ziehen' });

	await open(page, `/projects/${p.key}/board`);
	const review = column(page, 'Review');
	const box = (await review.boundingBox())!;
	const list = (await page.getByRole('region', { name: 'Review', exact: true }).boundingBox())!;
	// Die Spalte reicht deutlich über die (leere) Kartenliste hinaus
	expect(box.height).toBeGreaterThan(list.height + 200);

	// Deutlich unterhalb der Kartenliste und des „Ticket hinzufügen“-Buttons ablegen
	await card(page, 'Nach unten ziehen').dragTo(review, {
		targetPosition: { x: box.width / 2, y: list.y - box.y + list.height + 150 }
	});
	await expect.poll(async () => (await getTicket(request, t.key)).status).toBe('Review');
	await expect(page.getByRole('region', { name: 'Review', exact: true }).getByText('Nach unten ziehen')).toBeVisible();
});

test('eigene Reihenfolge auch in einer sortierten Spalte', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Bär' });
	await createTicket(request, p.key, { title: 'Chamäleon' });
	await createTicket(request, p.key, { title: 'Affe' });

	await open(page, `/projects/${p.key}/board`);
	await choose(page, /Sortierung/, 'Titel A–Z');
	expect(await cardTitles(page, 'Offen')).toEqual(['Affe', 'Bär', 'Chamäleon']);

	// Chamäleon nach ganz oben: die Spalte übernimmt die gezeigte Reihenfolge und wird manuell
	const affe = card(page, 'Affe');
	await card(page, 'Chamäleon').dragTo(affe, { targetPosition: { x: 40, y: 4 } });
	await expect.poll(() => cardTitles(page, 'Offen')).toEqual(['Chamäleon', 'Affe', 'Bär']);
	await expect(page.getByRole('button', { name: 'Spalte Offen sortieren' })).toContainText('Manuell');
	await expect(page.getByText('„Offen“ nutzt jetzt deine eigene Reihenfolge')).toBeVisible();

	const order = async () =>
		(await api<{ title: string; position: number }[]>(request, 'GET', `/projects/${p.key}/tickets`))
			.sort((a, b) => a.position - b.position)
			.map((t) => t.title);
	expect(await order()).toEqual(['Chamäleon', 'Affe', 'Bär']);

	// Bleibt nach Neuladen, andere Spalten sortieren weiter nach Titel
	await reload(page);
	expect(await cardTitles(page, 'Offen')).toEqual(['Chamäleon', 'Affe', 'Bär']);
	await expect(page.getByRole('button').filter({ hasText: 'Sortierung:Titel A–Z' })).toBeVisible();
});

test('Ablegen an der sortierten Stelle behält die Sortierung', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Affe', column: 'Review' });
	await createTicket(request, p.key, { title: 'Zebra', column: 'Review' });
	const t = await createTicket(request, p.key, { title: 'Bär' });

	await open(page, `/projects/${p.key}/board`);
	await choose(page, /Sortierung/, 'Titel A–Z');
	// Bär gehört alphabetisch zwischen Affe und Zebra
	await card(page, 'Bär').dragTo(card(page, 'Zebra'), { targetPosition: { x: 40, y: 4 } });
	await expect.poll(async () => (await getTicket(request, t.key)).status).toBe('Review');
	expect(await cardTitles(page, 'Review')).toEqual(['Affe', 'Bär', 'Zebra']);
	await expect(page.getByRole('button', { name: 'Spalte Review sortieren' })).not.toContainText('Manuell');
});
