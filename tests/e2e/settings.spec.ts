import { expect, test } from '@playwright/test';
import { api, createProject, open } from './helpers';

const columnNames = async (request: Parameters<typeof api>[0], key: string) =>
	(await api<{ name: string }[]>(request, 'GET', `/projects/${key}/columns`)).map((c) => c.name);

test('Spalten per Drag & Drop am Griff sortieren', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/settings`);

	const target = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('button', { name: 'Spalte Review verschieben' }) });
	await page.getByRole('button', { name: 'Spalte Offen verschieben' }).dragTo(target);

	await expect.poll(() => columnNames(request, p.key)).toEqual(['In Arbeit', 'Review', 'Offen', 'Erledigt']);
});

test('Spalten per Tastatur am Griff verschieben', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/settings`);

	await page.getByRole('button', { name: 'Spalte Erledigt verschieben' }).focus();
	await page.keyboard.press('ArrowUp');
	await expect.poll(() => columnNames(request, p.key)).toEqual(['Offen', 'In Arbeit', 'Erledigt', 'Review']);
	// Fokus bleibt auf dem Griff, ein weiterer Tastendruck verschiebt erneut
	await page.keyboard.press('ArrowUp');
	await expect.poll(() => columnNames(request, p.key)).toEqual(['Offen', 'Erledigt', 'In Arbeit', 'Review']);
});

test('Spalte als Backlog markieren', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/settings`);

	const offen = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('button', { name: 'Spalte Offen verschieben' }) });
	await offen.getByRole('checkbox', { name: 'Backlog' }).click();
	await expect
		.poll(
			async () =>
				(await api<{ name: string; isBacklog: boolean }[]>(request, 'GET', `/projects/${p.key}/columns`)).find(
					(c) => c.name === 'Offen'
				)?.isBacklog
		)
		.toBe(true);
});

test('Tag-Farbe über den Farbwähler ändern', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/settings`);

	await page.getByRole('button', { name: 'Farbe von Bug' }).click();
	await page.locator('[data-slot="popover-content"]').getByRole('button', { name: 'Farbe #22c55e' }).click();
	// Gespeichert wird beim Schließen des Popovers
	await page.keyboard.press('Escape');

	await expect
		.poll(
			async () =>
				(await api<{ name: string; color: string }[]>(request, 'GET', `/projects/${p.key}/tags`)).find(
					(t) => t.name === 'Bug'
				)?.color
		)
		.toBe('#22c55e');
});
