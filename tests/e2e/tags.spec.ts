import { expect, test } from '@playwright/test';
import { api, card, choose, createProject, createTicket, getTicket, open } from './helpers';

test('neue Projekte haben Standard-Tags', async ({ request }) => {
	const p = await createProject(request);
	const tags = await api<{ name: string }[]>(request, 'GET', `/projects/${p.key}/tags`);
	expect(tags.map((t) => t.name)).toEqual(['Bug', 'Feature', 'Story']);
});

test('Tag am Ticket vergeben und neuen Tag anlegen', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Login schlägt fehl' });

	await open(page, `/tickets/${t.key}`);
	await page.getByRole('button', { name: 'Keine Tags' }).click();
	await page.getByRole('option', { name: 'Bug' }).click();
	await page.getByPlaceholder('Tag suchen oder anlegen…').fill('Frontend');
	await page.getByRole('option', { name: '„Frontend“ anlegen' }).click();

	await expect
		.poll(async () => (await getTicket(request, t.key)).tags.map((g: { name: string }) => g.name))
		.toEqual(['Bug', 'Frontend']);
	await page.keyboard.press('Escape');

	// Tags erscheinen auf der Board-Karte
	await open(page, `/projects/${p.key}/board`);
	await expect(card(page, 'Login schlägt fehl')).toContainText('Bug');
	await expect(card(page, 'Login schlägt fehl')).toContainText('Frontend');
});

test('Board nach Tag filtern', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Absturz beim Speichern', tags: ['Bug'] });
	await createTicket(request, p.key, { title: 'Dunkles Design', tags: ['Feature'] });

	await open(page, `/projects/${p.key}/board`);
	await expect(card(page, 'Dunkles Design')).toBeVisible();

	await choose(page, 'Alle Tags', 'Bug');
	await expect(card(page, 'Absturz beim Speichern')).toBeVisible();
	await expect(card(page, 'Dunkles Design')).toHaveCount(0);
});

test('Tags in den Projekteinstellungen verwalten', async ({ page, request }) => {
	const p = await createProject(request);
	await open(page, `/projects/${p.key}/settings`);

	await page.getByPlaceholder('Neuer Tag').fill('Technische Schuld');
	await page.getByPlaceholder('Neuer Tag').press('Enter');
	await expect
		.poll(async () => (await api<{ name: string }[]>(request, 'GET', `/projects/${p.key}/tags`)).map((t) => t.name))
		.toContain('Technische Schuld');

	// Doppelte Namen (ohne Beachtung der Groß-/Kleinschreibung) werden abgelehnt
	const res = await request.post(`/api/v1/projects/${p.key}/tags`, { data: { name: 'bug' } });
	expect(res.status()).toBe(409);
});
