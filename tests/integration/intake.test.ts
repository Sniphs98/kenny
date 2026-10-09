import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { intakeForm, project } from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth-schema';
import {
	createForm,
	deleteForm,
	getPublicForm,
	listForms,
	regenerateToken,
	resetRateLimit,
	submitForm,
	updateForm
} from '$lib/server/services/intake';
import { createProject } from '$lib/server/services/projects';
import { getTicketDetail, listTickets } from '$lib/server/services/tickets';

const anonymous = { user: null, ip: '203.0.113.1' };
const signedIn = { user: { id: 'intake-user' }, ip: '203.0.113.9' };

beforeEach(() => {
	db.delete(intakeForm).run();
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user).values({ id: 'intake-user', name: 'Ina Intern', email: 'ina@example.com' }).run();
	resetRateLimit();
});

function setup(options: Record<string, unknown> = {}) {
	const web = createProject({ name: 'Web', key: 'WEB' }, null);
	const app = createProject({ name: 'App', key: 'APP' }, null);
	const form = createForm({ name: 'Support', projectIds: [web.id], ...options }, null);
	return { web, app, form };
}

describe('intake forms', () => {
	it('creates forms with projects and a random token', () => {
		const { web, app, form } = setup();
		expect(form).toMatchObject({ name: 'Support', requireLogin: false, emailMode: 'optional', active: true });
		expect(form.projects).toEqual([{ id: web.id, key: 'WEB', name: 'Web' }]);
		expect(form.token).toMatch(/^[\w-]{24}$/);

		const both = createForm({ name: 'Alle', projectIds: [web.id, app.id, web.id] }, null);
		expect(both.projects.map((p) => p.key)).toEqual(['APP', 'WEB']);
		expect(listForms().map((f) => f.name)).toEqual(['Alle', 'Support']);
		expect(() => createForm({ name: 'Leer', projectIds: [] }, null)).toThrow(/mindestens ein Projekt/);
		expect(() => createForm({ name: 'Falsch', projectIds: [999_999] }, null)).toThrow(/gibt es nicht/);
	});

	it('submits to the only project and records the origin', () => {
		const { web, form } = setup();
		const { key } = submitForm(form.token, { title: 'Login kaputt', email: 'kunde@example.com' }, anonymous);
		expect(key).toBe('WEB-1');
		const detail = getTicketDetail('WEB-1');
		expect(detail.ticket.title).toBe('Login kaputt');
		expect(detail.submission).toEqual({ form: 'Support', email: 'kunde@example.com' });
		expect(listTickets(web.id)[0].status).toBe('Offen');
	});

	it('lets the submitter choose among several projects', () => {
		const { web, app } = setup();
		const form = createForm({ name: 'Alle', projectIds: [web.id, app.id] }, null);
		expect(getPublicForm(form.token).projects.map((p) => p.key)).toEqual(['APP', 'WEB']);
		expect(() => submitForm(form.token, { title: 'Ohne Projekt' }, anonymous)).toThrow(/Projekt auswählen/);
		expect(() => submitForm(form.token, { title: 'Fremd', project: 'NOPE' }, anonymous)).toThrow(/Projekt auswählen/);
		expect(submitForm(form.token, { title: 'Für die App', project: 'app' }, anonymous).key).toBe('APP-1');
	});

	it('applies the e-mail mode only to anonymous submissions', () => {
		const { form } = setup({ emailMode: 'required' });
		expect(() => submitForm(form.token, { title: 'Ohne E-Mail' }, anonymous)).toThrow(/E-Mail-Adresse angeben/);
		expect(() => submitForm(form.token, { title: 'Kaputt', email: 'keine-mail' }, anonymous)).toThrow(/gültige E-Mail/);
		// Angemeldet: keine E-Mail nötig, Ersteller ist der Benutzer
		submitForm(form.token, { title: 'Angemeldet' }, signedIn);

		const hidden = updateForm(form.id, {
			name: 'Support',
			projectIds: form.projects.map((p) => p.id),
			emailMode: 'hidden'
		});
		submitForm(hidden.token, { title: 'Versteckt', email: 'ignoriert@example.com' }, anonymous);
		expect(getTicketDetail('WEB-2').submission).toEqual({ form: 'Support', email: null });
	});

	it('requires a login when configured', () => {
		const { form } = setup({ requireLogin: true });
		expect(getPublicForm(form.token).requireLogin).toBe(true);
		expect(() => submitForm(form.token, { title: 'Anonym' }, anonymous)).toThrow(/Anmeldung nötig/);
		expect(submitForm(form.token, { title: 'Angemeldet' }, signedIn).key).toBe('WEB-1');
	});

	it('rejects inactive forms and old links after regenerating', () => {
		const { form } = setup();
		const fresh = regenerateToken(form.id);
		expect(fresh.token).not.toBe(form.token);
		expect(() => getPublicForm(form.token)).toThrow(/nicht gefunden/);
		expect(getPublicForm(fresh.token).name).toBe('Support');

		updateForm(form.id, { name: 'Support', projectIds: form.projects.map((p) => p.id), active: false });
		expect(() => getPublicForm(fresh.token)).toThrow(/nicht gefunden/);
		expect(() => submitForm(fresh.token, { title: 'Zu spät' }, anonymous)).toThrow(/nicht gefunden/);
	});

	it('silently drops bot submissions and limits submissions per IP', () => {
		const { web, form } = setup();
		expect(submitForm(form.token, { title: 'Spam', website: 'http://spam.example' }, anonymous)).toEqual({ key: null });
		expect(listTickets(web.id)).toHaveLength(0);

		for (let i = 0; i < 10; i++) submitForm(form.token, { title: `Ticket ${i}` }, anonymous);
		expect(() => submitForm(form.token, { title: 'Eins zu viel' }, anonymous)).toThrow(/Zu viele/);
		expect(submitForm(form.token, { title: 'Andere IP' }, { user: null, ip: '203.0.113.2' }).key).toBe('WEB-11');
	});

	it('keeps submitted tickets when the form is deleted', () => {
		const { form } = setup();
		submitForm(form.token, { title: 'Bleibt', email: 'kunde@example.com' }, anonymous);
		deleteForm(form.id);
		expect(listForms()).toEqual([]);
		expect(getTicketDetail('WEB-1').submission).toEqual({ form: null, email: 'kunde@example.com' });
		expect(() => deleteForm(form.id)).toThrow(/nicht gefunden/);
	});
});
