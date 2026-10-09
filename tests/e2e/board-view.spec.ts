import { expect, test, type Page } from '@playwright/test';
import { card, choose, createProject, createTicket, day, getTicket, open, reload } from './helpers';

async function cardTitles(page: Page, region: string) {
	const cards = page.getByRole('region', { name: region, exact: true }).locator('[data-card]');
	await expect(cards.first()).toBeVisible();
	return cards.evaluateAll((els) => els.map((el) => el.querySelector('a.line-clamp-3')?.textContent?.trim()));
}

test('Board nach Priorität sortieren, Einstellung bleibt nach Neuladen', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Niedrig', priority: 'low' });
	await createTicket(request, p.key, { title: 'Dringend', priority: 'urgent' });
	await createTicket(request, p.key, { title: 'Hoch', priority: 'high' });

	await open(page, `/projects/${p.key}/board`);
	expect(await cardTitles(page, 'Offen')).toEqual(['Niedrig', 'Dringend', 'Hoch']);

	await choose(page, /Sortierung/, 'Priorität: hoch → niedrig');
	expect(await cardTitles(page, 'Offen')).toEqual(['Dringend', 'Hoch', 'Niedrig']);

	await reload(page);
	await expect(page.getByRole('button').filter({ hasText: 'Sortierung:Priorität: hoch → niedrig' })).toBeVisible();
	expect(await cardTitles(page, 'Offen')).toEqual(['Dringend', 'Hoch', 'Niedrig']);
});

test('einzelne Spalte abweichend sortieren', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Zebra' });
	await createTicket(request, p.key, { title: 'Affe' });

	await open(page, `/projects/${p.key}/board`);
	await page.getByRole('button', { name: 'Spalte Offen sortieren' }).click();
	await page.getByRole('menuitemradio', { name: 'Titel A–Z' }).click();
	expect(await cardTitles(page, 'Offen')).toEqual(['Affe', 'Zebra']);
	await expect(page.getByRole('button', { name: 'Spalte Offen sortieren' })).toContainText('Titel A–Z');
});

test('nach Tag gruppieren und Karte in andere Bahn ziehen', async ({ page, request }) => {
	const p = await createProject(request);
	const bug = await createTicket(request, p.key, { title: 'Falscher Preis', tags: ['Bug'] });
	await createTicket(request, p.key, { title: 'Wunschliste', tags: ['Feature'] });

	await open(page, `/projects/${p.key}/board`);
	await choose(page, /Gruppe/, 'Tag');

	await expect(page.getByRole('region', { name: 'Bug: Offen' }).getByText('Falscher Preis')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Feature: Offen' }).getByText('Wunschliste')).toBeVisible();

	// Ziehen in die Feature-Bahn ersetzt den Tag Bug durch Feature
	await card(page, 'Falscher Preis').dragTo(page.getByRole('region', { name: 'Feature: In Arbeit' }));
	await expect
		.poll(async () => {
			const t = await getTicket(request, bug.key);
			return { status: t.status, tags: t.tags.map((g: { name: string }) => g.name) };
		})
		.toEqual({ status: 'In Arbeit', tags: ['Feature'] });
	await expect(page.getByRole('region', { name: 'Feature: In Arbeit' }).getByText('Falscher Preis')).toBeVisible();
});

test('Schnell-Anlegen in einer Bahn übernimmt den Tag', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Vorhandener Bug', tags: ['Bug'] });

	await open(page, `/projects/${p.key}/board`);
	await choose(page, /Gruppe/, 'Tag');
	const lane = page.getByRole('region', { name: 'Bug: Review' }).locator('..');
	await lane.hover();
	await lane.getByRole('button', { name: 'Ticket hinzufügen' }).click();
	await page.getByPlaceholder('Titel, Enter zum Anlegen').fill('Neuer Bug');
	await page.getByPlaceholder('Titel, Enter zum Anlegen').press('Enter');

	await expect(page.getByRole('region', { name: 'Bug: Review' }).getByText('Neuer Bug')).toBeVisible();
});

test('Karten werden in einer vollen Spalte nicht abgeschnitten', async ({ page, request }) => {
	const p = await createProject(request);
	// Genug Karten mit zweizeiligen Titeln und Fälligkeit, damit die Spalte scrollen muss
	for (let i = 1; i <= 14; i++)
		await createTicket(request, p.key, { title: `Benachrichtigungen per E-Mail versenden ${i}`, dueDate: day(i) });

	await open(page, `/projects/${p.key}/board`);
	const list = page.getByRole('region', { name: 'Offen', exact: true });
	await expect(list.locator('[data-card]')).toHaveCount(14);

	// Die Spalte scrollt, statt die Karten zusammenzudrücken
	expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	const clipped = await list
		.locator('[data-card]')
		.evaluateAll((els) => els.filter((el) => el.scrollHeight > el.clientHeight + 1).length);
	expect(clipped).toBe(0);
});
