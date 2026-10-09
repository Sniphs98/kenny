import { expect, test } from '@playwright/test';
import { card, createProject, createTicket, getTicket, open } from './helpers';

// 1×1 Pixel PNG
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

test('Bild und Datei hochladen, ansehen und löschen', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Fehler im Layout' });

	await open(page, `/tickets/${t.key}`);
	await page.locator('input[type=file]').setInputFiles([
		{ name: 'screenshot.png', mimeType: 'image/png', buffer: PNG },
		{ name: 'log.txt', mimeType: 'text/plain', buffer: Buffer.from('Fehler in Zeile 42') }
	]);
	await expect(page.getByText('2 Dateien hochgeladen')).toBeVisible();

	// Bild als Vorschau, Datei als Download-Link
	const thumb = page.getByRole('img', { name: 'screenshot.png' });
	await expect(thumb).toBeVisible();
	await expect(page.getByRole('link', { name: 'log.txt' })).toBeVisible();

	// Großansicht und Löschen
	await thumb.click();
	const preview = page.getByRole('dialog', { name: 'screenshot.png' });
	await expect(preview.getByRole('link', { name: 'Herunterladen' })).toBeVisible();
	await preview.getByRole('button', { name: 'Löschen' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
	await expect(thumb).toHaveCount(0);

	const detail = await getTicket(request, t.key);
	expect(detail.attachments.map((a: { filename: string }) => a.filename)).toEqual(['log.txt']);

	// Board-Karte zeigt die Anzahl der Anhänge
	await open(page, `/projects/${p.key}/board`);
	await expect(card(page, 'Fehler im Layout').getByTitle(/Anhang/)).toContainText('1');
});

test('Anhänge sind nur angemeldet abrufbar und SVG wird nie inline ausgeliefert', async ({
	request,
	playwright,
	baseURL
}) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Sicherheit' });
	const res = await request.post(`/api/v1/tickets/${t.key}/attachments?filename=bild.svg`, {
		headers: { 'content-type': 'image/svg+xml' },
		data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
	});
	expect(res.status()).toBe(201);
	const [a] = await res.json();

	const file = await request.get(a.url);
	expect(file.headers()['content-disposition']).toMatch(/^attachment/);
	expect(file.headers()['content-type']).toBe('application/octet-stream');

	const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
	expect((await anonymous.get(a.url)).status()).toBe(401);
	await anonymous.dispose();
});
