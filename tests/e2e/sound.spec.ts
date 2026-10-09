import { expect, test, type Page } from '@playwright/test';
import { card, createProject, createTicket, getTicket, open } from './helpers';

// Den Ton selbst kann der Test nicht hören; die App meldet jeden abgespielten Ton als Fenster-Ereignis
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		window.addEventListener('kenny:complete-sound', () => {
			const root = document.documentElement;
			root.dataset.sounds = String(Number(root.dataset.sounds ?? 0) + 1);
		});
	});
});

const sounds = (page: Page) => page.locator('html').evaluate((el) => Number((el as HTMLElement).dataset.sounds ?? 0));

test('Ton beim Abhaken und Abschließen, nicht beim Wiederöffnen', async ({ page, request }) => {
	const p = await createProject(request);
	const parent = await createTicket(request, p.key, { title: 'Release' });
	await createTicket(request, p.key, { title: 'Changelog', parent: parent.key });

	await open(page, `/tickets/${parent.key}`);
	const subtask = page.getByRole('checkbox', { name: 'Erledigt' });

	await subtask.click();
	await expect(subtask).toBeChecked();
	expect(await sounds(page)).toBe(1);

	// Wieder öffnen ist still
	await subtask.click();
	await expect(subtask).not.toBeChecked();
	expect(await sounds(page)).toBe(1);

	await page.getByRole('button', { name: 'Abschließen' }).click();
	await expect(page.getByRole('button', { name: 'Wieder öffnen' })).toBeVisible();
	expect(await sounds(page)).toBe(2);
	expect((await getTicket(request, parent.key)).closed).toBe(true);
});

test('Ton beim Ziehen in eine Erledigt-Spalte', async ({ page, request }) => {
	const p = await createProject(request);
	await createTicket(request, p.key, { title: 'Fertig machen' });
	await open(page, `/projects/${p.key}/board`);

	await card(page, 'Fertig machen').dragTo(page.getByRole('region', { name: 'Review', exact: true }));
	await expect(page.getByRole('region', { name: 'Review', exact: true }).locator('[data-card]')).toHaveCount(1);
	expect(await sounds(page)).toBe(0);

	await card(page, 'Fertig machen').dragTo(page.getByRole('region', { name: 'Erledigt', exact: true }));
	await expect(page.getByRole('region', { name: 'Erledigt', exact: true }).locator('[data-card]')).toHaveCount(1);
	await expect.poll(() => sounds(page)).toBe(1);
});

test('Ton lässt sich im Benutzermenü abschalten', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Leise erledigen' });
	await open(page, `/tickets/${t.key}`);

	await page.getByRole('button', { name: /Erika Test/ }).click();
	const toggle = page.getByRole('menuitemcheckbox', { name: 'Ton bei Erledigt' });
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: 'Abschließen' }).click();
	await expect(page.getByRole('button', { name: 'Wieder öffnen' })).toBeVisible();
	expect(await sounds(page)).toBe(0);

	// Einschalten spielt den Ton einmal zur Probe
	await page.getByRole('button', { name: /Erika Test/ }).click();
	await page.getByRole('menuitemcheckbox', { name: 'Ton bei Erledigt' }).click();
	expect(await sounds(page)).toBe(1);
});
