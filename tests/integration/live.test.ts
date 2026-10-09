import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { listenerCount, liveOrigin, subscribe, type LiveEvent } from '$lib/server/live';
import { addAttachments, deleteAttachment } from '$lib/server/services/attachments';
import { addColumn, createProject, deleteProject, updateProject } from '$lib/server/services/projects';
import { createTag } from '$lib/server/services/tags';
import {
	addLink,
	closeTicket,
	createTicket,
	deleteTicket,
	removeLink,
	reopenTicket,
	updateTicket
} from '$lib/server/services/tickets';

let events: LiveEvent[] = [];
let unsubscribe = () => {};

beforeEach(() => {
	db.delete(project).run();
	events = [];
	unsubscribe = subscribe(null, (e) => events.push(e));
});
afterEach(() => unsubscribe());

describe('live updates from services', () => {
	it('publishes every successful change with project and ticket', async () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, null);
		const a = createTicket(p.key, { title: 'A' }, null);
		const b = createTicket(p.key, { title: 'B' }, null);
		updateTicket(a.key, { title: 'A2' });
		closeTicket(a.key);
		reopenTicket(a.key);
		const link = addLink(b.key, { target: a.key, type: 'depends_on' });
		removeLink(b.key, link.id);
		createTag(p.key, { name: 'Neu' });
		addColumn(p.id, { name: 'QA' });
		updateProject(p.id, { name: 'Web 2' });
		const [file] = await addAttachments(a.key, [new File(['hallo'], 'notiz.txt', { type: 'text/plain' })], null);
		await deleteAttachment(file.id);
		await deleteTicket(b.key);

		expect(events.every((e) => e.projectId === p.id)).toBe(true);
		expect(events.map((e) => e.ticket).filter(Boolean)).toEqual(['WEB-1', 'WEB-2', 'WEB-1', 'WEB-1', 'WEB-1']);
		// Projekt, 2× anlegen, ändern, schließen, öffnen, 2× Verknüpfung, Tag, Spalte, Projekt, 2× Anhang, löschen
		expect(events).toHaveLength(14);

		await deleteProject(p.id);
		expect(events.at(-1)).toMatchObject({ projectId: p.id, kind: 'deleted' });
	});

	it('does not publish when a change is rejected', () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, null);
		events = [];
		expect(() => createTicket(p.key, { title: 'Kaputt', dependsOn: ['WEB-999'] }, null)).toThrow();
		expect(() => updateTicket('WEB-999', { title: 'x' })).toThrow();
		expect(events).toEqual([]);
	});

	it('carries the origin tab and filters by project', () => {
		const web = createProject({ name: 'Web', key: 'WEB' }, null);
		const app = createProject({ name: 'App', key: 'APP' }, null);
		const onlyApp: LiveEvent[] = [];
		const stop = subscribe(app.id, (e) => onlyApp.push(e));

		liveOrigin.run('tab-1', () => createTicket(web.key, { title: 'Web-Ticket' }, null));
		createTicket(app.key, { title: 'App-Ticket' }, null);

		expect(events.at(-2)).toMatchObject({ projectId: web.id, origin: 'tab-1' });
		expect(events.at(-1)).toMatchObject({ projectId: app.id, origin: undefined });
		expect(onlyApp.map((e) => e.ticket)).toEqual(['APP-1']);

		stop();
		expect(listenerCount()).toBe(1);
	});
});
