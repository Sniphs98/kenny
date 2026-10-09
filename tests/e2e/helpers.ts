import { expect, type APIRequestContext, type Page } from '@playwright/test';

type Json = Record<string, unknown>;

/** REST-API mit der Sitzung des Testbenutzers aufrufen */
export async function api<T = any>(request: APIRequestContext, method: string, path: string, data?: Json): Promise<T> {
	const res = await request.fetch(`/api/v1${path}`, { method, data });
	expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBeTruthy();
	return res.json();
}

let counter = 0;

/** Eigenes Projekt pro Test, damit Tests parallel laufen können */
export async function createProject(request: APIRequestContext, name = 'Test') {
	const key = `T${Date.now().toString(36).slice(-5).toUpperCase()}${counter++}${Math.floor(Math.random() * 90 + 10)}`;
	return api<{ id: number; key: string }>(request, 'POST', '/projects', { name: `${name} ${key}`, key });
}

export function createTicket(request: APIRequestContext, projectKey: string, data: Json) {
	return api<{ id: number; key: string; title: string }>(request, 'POST', `/projects/${projectKey}/tickets`, data);
}

export function getTicket(request: APIRequestContext, ref: string) {
	return api<any>(request, 'GET', `/tickets/${ref}`);
}

/** Seite öffnen und warten, bis Svelte hydriert ist (vorher reagieren Buttons noch nicht) */
export async function open(page: Page, url: string) {
	await page.goto(url);
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

/** Neu laden und auf Hydration warten */
export async function reload(page: Page) {
	await page.reload();
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

/** Karte im Kanban-Board anhand des Titels */
export const card = (page: Page, title: string) => page.locator('[data-card]').filter({ hasText: title });

/** Ein Select (bits-ui) über den Text im Auslöser öffnen und eine Option wählen */
export async function choose(page: Page, triggerText: string | RegExp, option: string) {
	await page.getByRole('button').filter({ hasText: triggerText }).click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

/** Datum als YYYY-MM-DD, relativ zu heute */
export function day(offset = 0) {
	const d = new Date();
	d.setDate(d.getDate() + offset);
	return d.toISOString().slice(0, 10);
}
