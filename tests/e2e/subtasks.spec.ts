import { expect, test } from '@playwright/test';
import { card, createProject, createTicket, getTicket, open } from './helpers';

test('mehrere Unteraufgaben nacheinander im Modal anlegen', async ({ page, request }) => {
	const p = await createProject(request);
	const parent = await createTicket(request, p.key, { title: 'Checkout überarbeiten' });

	await open(page, `/projects/${p.key}/board`);
	await card(page, 'Checkout überarbeiten').getByRole('link', { name: 'Checkout überarbeiten' }).click();

	const modal = page.getByRole('dialog');
	await expect(modal).toBeVisible();
	await expect(page).toHaveURL(`/tickets/${parent.key}`);

	const input = modal.getByPlaceholder('Neue Unteraufgabe');
	for (const title of ['Warenkorb prüfen', 'Zahlung testen', 'Bestätigungsmail']) {
		await input.fill(title);
		await modal.getByRole('button', { name: 'Hinzufügen' }).first().click();
		// Unteraufgabe erscheint sofort im Dialog, ohne Fehler
		await expect(modal.getByRole('link', { name: new RegExp(title) })).toBeVisible();
		await expect(input).toHaveValue('');
	}
	await expect(page.getByText(/Ticket ".*" nicht gefunden/)).toHaveCount(0);

	const detail = await getTicket(request, parent.key);
	expect(detail.subtasks.map((s: { title: string }) => s.title)).toEqual([
		'Warenkorb prüfen',
		'Zahlung testen',
		'Bestätigungsmail'
	]);

	// Modal schließen: Karte im Board zeigt den Fortschritt
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
	await expect(card(page, 'Checkout überarbeiten')).toContainText('0/3');
});

test('Unteraufgaben auf der Board-Karte auf- und zuklappen', async ({ page, request }) => {
	const p = await createProject(request);
	const parent = await createTicket(request, p.key, { title: 'Release vorbereiten' });
	await createTicket(request, p.key, { title: 'Changelog schreiben', parent: parent.key });

	await open(page, `/projects/${p.key}/board`);
	const c = card(page, 'Release vorbereiten');
	const toggle = c.getByRole('button', { name: /Unteraufgaben/ });

	// Standardmäßig zugeklappt
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(c.getByText('Changelog schreiben')).toBeHidden();

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(c.getByText('Changelog schreiben')).toBeVisible();
	// Klick auf den Umschalter öffnet nicht das Ticket
	await expect(page.getByRole('dialog')).toBeHidden();

	await toggle.click();
	await expect(c.getByText('Changelog schreiben')).toBeHidden();
});
