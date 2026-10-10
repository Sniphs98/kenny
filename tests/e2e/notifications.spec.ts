import { expect, test } from '@playwright/test';
import { createProject, open } from './helpers';

// Nur die Einstellungen: in diesem Projekt entstehen keine Tickets, es wird also nichts an Microsoft gesendet
const WEBHOOK = 'https://prod-00.westeurope.logic.azure.com/workflows/e2e/triggers/manual/paths/invoke?sig=E2E-GEHEIM';

test('Teams-Benachrichtigungen einrichten, ändern und entfernen', async ({ page, request }) => {
	const p = await createProject(request, 'Benachrichtigt');
	await open(page, `/projects/${p.key}/settings`);
	const card = page.locator('[data-notifications]');
	await expect(card).toContainText('Teams-Benachrichtigungen');
	const url = card.getByLabel('Webhook-Adresse des Workflows');
	const save = card.getByRole('button', { name: 'Speichern' });

	// Fremde Ziele lehnt schon der Browser ab (der Server prüft zusätzlich)
	await url.fill('https://intranet.firma.example/hook');
	await expect(card).toContainText('Bitte die Webhook-Adresse eines Teams-Workflows');
	await expect(save).toBeDisabled();

	await url.fill(WEBHOOK);
	await card.getByRole('checkbox', { name: 'Ticket zugewiesen' }).click();
	await save.click();
	await expect(page.getByText('Benachrichtigungen gespeichert')).toBeVisible();
	await expect(card.getByText('Aktiv', { exact: true })).toBeVisible();
	await expect(url).toHaveValue('');
	await expect(url).toHaveAttribute('placeholder', /Verbunden mit prod-00\.westeurope\.logic\.azure\.com/);
	// Die Adresse enthält die Signatur des Workflows und wird nie wieder ausgeliefert
	expect(await page.content()).not.toContain('E2E-GEHEIM');
	expect(await (await request.get(`/api/v1/projects/${p.key}/notifications`)).text()).not.toContain('E2E-GEHEIM');

	// Sprache ändern, ohne die Adresse erneut einzugeben
	await card.getByRole('button', { name: 'Sprache der Nachrichten' }).click();
	await page.getByRole('option', { name: 'English' }).click();
	const saved = page.waitForResponse((r) => r.url().endsWith('/notifications') && r.request().method() === 'PUT');
	await save.click();
	expect((await saved).status()).toBe(200);
	await page.reload();
	await expect(card.getByRole('checkbox', { name: 'Ticket zugewiesen' })).not.toBeChecked();
	await expect(card.getByRole('checkbox', { name: 'Ticket erledigt' })).toBeChecked();
	await expect(card.getByRole('button', { name: 'Sprache der Nachrichten' })).toContainText('English');

	await card.getByRole('button', { name: 'Entfernen' }).click();
	await expect(page.getByText('Benachrichtigungen entfernt')).toBeVisible();
	await expect(card.getByText('Aktiv', { exact: true })).toHaveCount(0);
	await expect(card.getByRole('button', { name: 'Testnachricht senden' })).toHaveCount(0);
});
