import { expect, test as setup } from '@playwright/test';

/** Testbenutzer registrieren und die Sitzung für alle weiteren Tests speichern */
setup('Testbenutzer registrieren', async ({ page }) => {
	await page.goto('/login');
	// Der Umschalter reagiert erst nach der Hydration, daher bis zum Erfolg wiederholen
	await expect(async () => {
		await page.getByRole('link', { name: 'Registrieren' }).click();
		await expect(page.getByRole('heading', { name: 'Konto erstellen' })).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByLabel('Name').fill('Erika Test');
	await page.getByLabel('E-Mail').fill('erika@example.com');
	await page.getByLabel('Passwort').fill('geheim-12345');
	await page.getByRole('button', { name: 'Registrieren' }).click();
	await expect(page).toHaveURL('/');
	await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
