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

test('Neue Aufgabe landet im Backlog und lässt sich hinein und heraus ziehen', async ({ page, request }) => {
	const p = await createProject(request);

	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Aufgabe', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Titel').fill('Idee prüfen');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(dialog).toBeHidden();

	const backlog = page.getByRole('group', { name: 'Backlog' });
	await expect(backlog.getByText('Idee prüfen')).toBeVisible();
	const task = card(page, 'Idee prüfen');
	const key = `${p.key}-1`;
	expect(await getTicket(request, key)).toMatchObject({ status: 'Backlog', parentId: null });
	await expect(page.getByRole('region', { name: 'Allgemein: Offen' }).getByText('Idee prüfen')).toHaveCount(0);

	await task.dragTo(page.getByRole('region', { name: 'Allgemein: Offen' }));
	await expect.poll(async () => (await getTicket(request, key)).status).toBe('Offen');
	await card(page, 'Idee prüfen').dragTo(backlog);
	await expect.poll(async () => (await getTicket(request, key)).status).toBe('Backlog');
	await expect(backlog.getByText('Idee prüfen')).toBeVisible();
});

test('Eine Aufgabe lässt sich in einen noch nicht angelegten Backlog ziehen', async ({ page, request }) => {
	const p = await createProject(request);
	const task = await createTicket(request, p.key, { title: 'Später prüfen' });

	await open(page, `/projects/${p.key}/board`);
	const backlog = page.getByRole('group', { name: 'Backlog' });
	await card(page, 'Später prüfen').dragTo(backlog);
	await expect.poll(async () => (await getTicket(request, task.key)).status).toBe('Backlog');
	await expect(backlog.getByText('Später prüfen')).toBeVisible();
});

test('Backlog-Aufgabe lässt sich in eine Tag-Spalte einfügen', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Vorhanden', tags: ['Feature'] });
	await api(request, 'POST', `/projects/${p.key}/columns`, { name: 'Backlog', isBacklog: true });
	const task = await createTicket(request, p.key, { title: 'Idee', column: 'Backlog' });

	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: /Aktuelle Einstellungen/ }).click();
	await page.locator('#board-view-columns').click();
	await page.getByRole('option', { name: 'Tag', exact: true }).click();
	await page.getByRole('button', { name: /Aktuelle Einstellungen/ }).click();

	await card(page, 'Idee').dragTo(page.getByRole('region', { name: 'Allgemein: Feature' }));
	await expect.poll(async () => {
		const moved = await getTicket(request, task.key);
		return { status: moved.status, tags: moved.tags.map((tag) => tag.name) };
	}).toEqual({ status: 'Offen', tags: ['Feature'] });
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
