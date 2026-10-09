import { expect, test } from '@playwright/test';
import { createProject, createTicket, getTicket, open } from './helpers';

test('Ticket über die Auswahl verknüpfen', async ({ page, request }) => {
	const p = await createProject(request);
	const a = await createTicket(request, p.key, { title: 'API entwerfen' });
	const b = await createTicket(request, p.key, { title: 'Frontend anbinden' });
	await createTicket(request, p.key, { title: 'Doku schreiben' });

	await open(page, `/tickets/${b.key}`);
	const link = page.getByRole('button', { name: 'Verknüpfen' });
	await expect(link).toBeDisabled();

	// Durchsuchbare Auswahl statt nativer Browser-Liste; das eigene Ticket wird nicht angeboten
	await page.getByRole('button', { name: 'Ticket wählen' }).click();
	await expect(page.getByRole('option', { name: new RegExp(b.key) })).toHaveCount(0);
	await page.getByPlaceholder('Nummer oder Titel suchen…').fill('entwerfen');
	await expect(page.getByRole('option')).toHaveCount(1);
	await page.getByRole('option', { name: /API entwerfen/ }).click();

	await expect(link).toBeEnabled();
	await link.click();
	await expect(page.getByRole('link', { name: /API entwerfen/ })).toBeVisible();

	const detail = await getTicket(request, b.key);
	expect(detail.links.map((l: { relation: string; ticket: { key: string } }) => [l.relation, l.ticket.key])).toEqual([
		['depends_on', a.key]
	]);

	// Bereits verknüpfte Tickets werden nicht erneut angeboten
	await page.getByRole('button', { name: 'Ticket wählen' }).click();
	await expect(page.getByRole('option', { name: /Doku schreiben/ })).toBeVisible();
	await expect(page.getByRole('option', { name: /API entwerfen/ })).toHaveCount(0);
});
