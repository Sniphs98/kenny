import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { intakeForm, project, user } from '$lib/server/db/schema';
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
import { createTag } from '$lib/server/services/tags';
import { getTicketDetail, listTickets } from '$lib/server/services/tickets';

const anonymous = { user: null, ip: '203.0.113.1' };
/** Angemeldet, aber ohne Mitgliedschaft in irgendeinem Projekt */
const outsider = { user: { id: 'outsider' }, ip: '203.0.113.9' };

beforeEach(() => {
	db.delete(intakeForm).run();
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'root', name: 'Admin', email: 'admin@example.com', role: 'admin' },
			{ id: 'owner', name: 'Olga Owner', email: 'owner@example.com' },
			{ id: 'outsider', name: 'Otto Outsider', email: 'outsider@example.com' }
		])
		.run();
	resetRateLimit();
});

/** Zwei Projekte der Besitzerin (Projekt-Admin) und ein Formular für das erste */
function setup(options: Record<string, unknown> = {}) {
	const web = createProject({ name: 'Web', key: 'WEB' }, 'owner');
	const app = createProject({ name: 'App', key: 'APP' }, 'owner');
	const form = createForm({ name: 'Support', projectIds: [web.id], ...options }, 'owner');
	return { web, app, form };
}

const update = (form: { id: number; name: string; projects: { id: number }[] }, changes: Record<string, unknown>) =>
	updateForm(form.id, { name: form.name, projectIds: form.projects.map((p) => p.id), ...changes }, 'owner');

describe('intake forms: management', () => {
	it('creates forms with projects, default fields and a random token', () => {
		const { web, app, form } = setup();
		expect(form).toMatchObject({ name: 'Support', requireLogin: false, emailMode: 'optional', active: true });
		expect(form.fields).toEqual({
			description: 'optional',
			priority: 'hidden',
			startDate: 'hidden',
			dueDate: 'hidden',
			tags: 'hidden',
			attachments: 'hidden'
		});
		expect(form.projects).toEqual([{ id: web.id, key: 'WEB', name: 'Web' }]);
		expect(form.token).toMatch(/^[\w-]{24}$/);

		const both = createForm({ name: 'Alle', projectIds: [web.id, app.id, web.id] }, 'owner');
		expect(both.projects.map((p) => p.key)).toEqual(['APP', 'WEB']);
		expect(listForms('owner').map((f) => f.name)).toEqual(['Alle', 'Support']);
		expect(() => createForm({ name: 'Leer', projectIds: [] }, 'owner')).toThrow(/mindestens ein Projekt/);
		expect(() => createForm({ name: 'Falsch', projectIds: [999_999] }, 'owner')).toThrow(/gibt es nicht/);
	});

	it('only lets project administrators manage forms for their projects', () => {
		const { web, form } = setup();
		// Ohne Admin-Rolle im Projekt: Formular unsichtbar und nicht änderbar
		expect(listForms('outsider')).toEqual([]);
		expect(() => createForm({ name: 'Fremd', projectIds: [web.id] }, 'outsider')).toThrow(
			/Unzureichende Projektberechtigungen/
		);
		expect(() => updateForm(form.id, { name: 'X', projectIds: [web.id] }, 'outsider')).toThrow(/nicht gefunden/);
		expect(() => regenerateToken(form.id, 'outsider')).toThrow(/nicht gefunden/);
		expect(() => deleteForm(form.id, 'outsider')).toThrow(/nicht gefunden/);
		// Instanz-Admins dürfen alles
		expect(listForms('root').map((f) => f.name)).toEqual(['Support']);

		// Ein eigenes Projekt reicht nicht, um ein fremdes Projekt hinzuzufügen
		const own = createProject({ name: 'Eigen', key: 'OWN' }, 'outsider');
		expect(() => createForm({ name: 'Gemischt', projectIds: [own.id, web.id] }, 'outsider')).toThrow(
			/Unzureichende Projektberechtigungen/
		);
		expect(createForm({ name: 'Eigenes', projectIds: [own.id] }, 'outsider').projects).toHaveLength(1);
	});

	it('rejects inactive forms and old links after regenerating', () => {
		const { form } = setup();
		const fresh = regenerateToken(form.id, 'owner');
		expect(fresh.token).not.toBe(form.token);
		expect(() => getPublicForm(form.token)).toThrow(/nicht gefunden/);
		expect(getPublicForm(fresh.token).name).toBe('Support');

		update(form, { active: false });
		expect(() => getPublicForm(fresh.token)).toThrow(/nicht gefunden/);
		return expect(submitForm(fresh.token, { title: 'Zu spät' }, anonymous)).rejects.toThrow(/nicht gefunden/);
	});

	it('keeps submitted tickets when the form is deleted', async () => {
		const { form } = setup();
		await submitForm(form.token, { title: 'Bleibt', email: 'kunde@example.com' }, anonymous);
		deleteForm(form.id, 'owner');
		expect(listForms('owner')).toEqual([]);
		expect(getTicketDetail('WEB-1').submission).toEqual({ form: null, email: 'kunde@example.com' });
	});
});

describe('intake forms: submitting', () => {
	it('submits to the only project and records the origin', async () => {
		const { web, form } = setup();
		const { key } = await submitForm(form.token, { title: 'Login kaputt', email: 'kunde@example.com' }, anonymous);
		expect(key).toBe('WEB-1');
		const detail = getTicketDetail('WEB-1');
		expect(detail.ticket.title).toBe('Login kaputt');
		expect(detail.submission).toEqual({ form: 'Support', email: 'kunde@example.com' });
		expect(listTickets(web.id)[0].status).toBe('Offen');
	});

	it('lets the submitter choose among several projects', async () => {
		const { web, app } = setup();
		const form = createForm({ name: 'Alle', projectIds: [web.id, app.id] }, 'owner');
		expect(getPublicForm(form.token).projects.map((p) => p.key)).toEqual(['APP', 'WEB']);
		await expect(submitForm(form.token, { title: 'Ohne Projekt' }, anonymous)).rejects.toThrow(/Projekt auswählen/);
		await expect(submitForm(form.token, { title: 'Fremd', project: 'NOPE' }, anonymous)).rejects.toThrow(
			/Projekt auswählen/
		);
		expect((await submitForm(form.token, { title: 'Für die App', project: 'app' }, anonymous)).key).toBe('APP-1');
	});

	it('applies the e-mail mode only to anonymous submissions', async () => {
		const { form } = setup({ emailMode: 'required' });
		await expect(submitForm(form.token, { title: 'Ohne E-Mail' }, anonymous)).rejects.toThrow(/E-Mail-Adresse angeben/);
		await expect(submitForm(form.token, { title: 'Kaputt', email: 'keine-mail' }, anonymous)).rejects.toThrow(
			/gültige E-Mail/
		);
		// Angemeldet: keine E-Mail nötig, Ersteller ist der Benutzer
		await submitForm(form.token, { title: 'Angemeldet' }, outsider);

		const hidden = update(form, { emailMode: 'hidden' });
		await submitForm(hidden.token, { title: 'Versteckt', email: 'ignoriert@example.com' }, anonymous);
		expect(getTicketDetail('WEB-2').submission).toEqual({ form: 'Support', email: null });
	});

	it('requires a login, but no project membership, when configured', async () => {
		const { form } = setup({ requireLogin: true });
		expect(getPublicForm(form.token).requireLogin).toBe(true);
		await expect(submitForm(form.token, { title: 'Anonym' }, anonymous)).rejects.toThrow(/Anmeldung nötig/);
		// Das Formular ist die Freigabe: auch ohne Mitgliedschaft im Projekt
		expect((await submitForm(form.token, { title: 'Angemeldet' }, outsider)).key).toBe('WEB-1');
	});

	it('silently drops bot submissions and limits submissions per IP', async () => {
		const { web, form } = setup();
		expect(await submitForm(form.token, { title: 'Spam', website: 'http://spam.example' }, anonymous)).toEqual({
			key: null
		});
		expect(listTickets(web.id)).toHaveLength(0);

		for (let i = 0; i < 10; i++) await submitForm(form.token, { title: `Ticket ${i}` }, anonymous);
		await expect(submitForm(form.token, { title: 'Eins zu viel' }, anonymous)).rejects.toThrow(/Zu viele/);
		expect((await submitForm(form.token, { title: 'Andere IP' }, { user: null, ip: '203.0.113.2' })).key).toBe(
			'WEB-11'
		);
	});
});

describe('intake forms: configurable fields', () => {
	it('stores offered fields and ignores values of hidden fields', async () => {
		const { form } = setup({ fields: { description: 'hidden' } });
		await submitForm(
			form.token,
			{ title: 'Nur Titel', description: 'ignoriert', priority: 'urgent', dueDate: '2026-12-01' },
			anonymous
		);
		const detail = getTicketDetail('WEB-1');
		expect(detail.ticket).toMatchObject({ description: '', priority: 'medium', dueDate: null });
	});

	it('takes priority, dates and existing tags when offered', async () => {
		const { web, form } = setup({
			fields: { priority: 'optional', startDate: 'optional', dueDate: 'optional', tags: 'optional' }
		});
		createTag(web.key, { name: 'Kunde' });
		expect(getPublicForm(form.token).projects[0].tags.map((t) => t.name)).toEqual(['Bug', 'Feature', 'Kunde', 'Story']);

		await submitForm(
			form.token,
			{ title: 'Voll', priority: 'high', startDate: '2026-11-01', dueDate: '2026-11-05', tags: ['kunde', 'Bug'] },
			anonymous
		);
		const detail = getTicketDetail('WEB-1');
		expect(detail.ticket).toMatchObject({ priority: 'high', startDate: '2026-11-01', dueDate: '2026-11-05' });
		expect(detail.ticket.tags.map((t) => t.name).sort()).toEqual(['Bug', 'Kunde']);

		// Keine neuen Tags über ein Formular, keine verdrehten Daten
		await expect(submitForm(form.token, { title: 'Neu', tags: ['Erfunden'] }, anonymous)).rejects.toThrow(
			/gibt es in diesem Projekt nicht/
		);
		await expect(
			submitForm(form.token, { title: 'Rückwärts', startDate: '2026-11-05', dueDate: '2026-11-01' }, anonymous)
		).rejects.toThrow(/Startdatum liegt nach/);
	});

	it('enforces required fields', async () => {
		const { form } = setup({
			fields: { description: 'required', priority: 'required', dueDate: 'required', tags: 'required' }
		});
		await expect(submitForm(form.token, { title: 'Leer' }, anonymous)).rejects.toThrow(/Beschreibung angeben/);
		await expect(submitForm(form.token, { title: 'X', description: 'D' }, anonymous)).rejects.toThrow(
			/Priorität wählen/
		);
		await expect(submitForm(form.token, { title: 'X', description: 'D', priority: 'low' }, anonymous)).rejects.toThrow(
			/Fälligkeitsdatum angeben/
		);
		await expect(
			submitForm(form.token, { title: 'X', description: 'D', priority: 'low', dueDate: '2026-12-01' }, anonymous)
		).rejects.toThrow(/mindestens einen Tag/);
		const done = await submitForm(
			form.token,
			{ title: 'X', description: 'D', priority: 'low', dueDate: '2026-12-01', tags: ['Bug'] },
			anonymous
		);
		expect(done.key).toBe('WEB-1');
	});

	it('attaches files only when offered and within the limits', async () => {
		const { web, form } = setup();
		const file = (name: string) => new File(['Inhalt'], name, { type: 'text/plain' });

		// Ausgeblendet: Dateien werden ignoriert
		await submitForm(form.token, { title: 'Ohne Anhänge' }, { ...anonymous, files: [file('a.txt')] });
		expect(getTicketDetail('WEB-1').attachments).toEqual([]);

		const withFiles = update(form, { fields: { attachments: 'required' } });
		await expect(submitForm(withFiles.token, { title: 'Fehlt' }, anonymous)).rejects.toThrow(/Datei anhängen/);
		await expect(
			submitForm(
				withFiles.token,
				{ title: 'Zu viele' },
				{ ...anonymous, files: [1, 2, 3, 4, 5, 6].map((i) => file(`${i}.txt`)) }
			)
		).rejects.toThrow(/Höchstens 5 Dateien/);
		// Abgelehnte Einreichungen legen kein Ticket an
		expect(listTickets(web.id)).toHaveLength(1);

		await submitForm(withFiles.token, { title: 'Mit Datei' }, { ...anonymous, files: [file('log.txt')] });
		expect(getTicketDetail('WEB-2').attachments.map((a) => a.filename)).toEqual(['log.txt']);
	});
});
