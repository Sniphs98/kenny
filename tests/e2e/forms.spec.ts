import { expect, test } from '@playwright/test';
import { createProject, open } from './helpers';

test('Superforms creates a project and redirects to its board', async ({ page }) => {
	await open(page, '/');
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	const dialog = page.getByRole('dialog');
	const key = `F${Date.now().toString(36).slice(-7).toUpperCase()}`;
	await dialog.getByLabel('Name').fill('Superforms project');
	await dialog.getByLabel('Kürzel').fill(key.toLowerCase());
	const other = await createProject(page.request, 'External live project');
	await expect(page.getByText(`External live project ${other.key}`, { exact: true })).toBeVisible();
	await expect(dialog.getByLabel('Name')).toHaveValue('Superforms project');
	await expect(dialog.getByLabel('Kürzel')).toHaveValue(key.toLowerCase());
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(page).toHaveURL(`/projects/${key}/board`);
});

test('project form reports invalid keys and duplicate keys', async ({ page, request }) => {
	const project = await createProject(request);
	await open(page, '/');
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Name').fill('Validation test');
	await dialog.getByLabel('Kürzel').fill('1invalid');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText('Kürzel');
	await dialog.getByLabel('Kürzel').fill(project.key);
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText('bereits vergeben');
});

test('ticket dialog uses Superforms and the typed API command', async ({ page, request }) => {
	const project = await createProject(request);
	await open(page, `/projects/${project.key}/board`);
	await page.getByRole('button', { name: 'Ticket', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Titel').fill('Ticket through Superforms');
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('link', { name: 'Ticket through Superforms', exact: true })).toBeVisible();
});
