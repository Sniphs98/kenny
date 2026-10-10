import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { project, user } from '$lib/server/db/schema';
import { createProject } from '$lib/server/services/projects';
import { closeTicket, createTicket, searchTickets } from '$lib/server/services/tickets';
import { addMember } from '$lib/server/services/users';

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'owner', name: 'Olga Owner', email: 'owner@example.com' },
			{ id: 'reader', name: 'Rita Reader', email: 'reader@example.com' }
		])
		.run();
});

const keys = (userId: string, query: string, limit?: number) =>
	searchTickets(userId, { query, limit }).tickets.map((t) => t.key);

describe('ticket search for the command palette', () => {
	it('ranks exact keys, key prefixes, titles and descriptions, open before closed', () => {
		const web = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		// WEB-1 … WEB-12; nur der Titel von WEB-12 enthält „login“ am Anfang
		for (let i = 1; i <= 11; i++) createTicket(web.key, { title: `Aufgabe ${i}` }, 'owner');
		createTicket(web.key, { title: 'Login reparieren' }, 'owner');
		createTicket(web.key, { title: 'Seite mit Login-Formular' }, 'owner');
		createTicket(web.key, { title: 'Sonstiges', description: 'betrifft den Login' }, 'owner');
		closeTicket('WEB-12');
		createTicket(web.key, { title: 'Login für Gäste' }, 'owner');

		// Genauer Schlüssel vor anderen Schlüsseln mit demselben Anfang
		expect(keys('owner', 'web-1').slice(0, 4)).toEqual(['WEB-1', 'WEB-10', 'WEB-11', 'WEB-13']);
		expect(keys('owner', 'WEB-12')[0]).toBe('WEB-12');
		// Titel-Anfang vor Titel-Mitte vor Beschreibung; Erledigtes zuletzt in seiner Stufe
		expect(keys('owner', 'login')).toEqual(['WEB-15', 'WEB-12', 'WEB-13', 'WEB-14']);
		expect(searchTickets('owner', { query: 'login', limit: 2 })).toMatchObject({ total: 4, tickets: [{}, {}] });
		expect(keys('owner', 'gibt es nicht')).toEqual([]);
	});

	it('finds every word anywhere, after matches of the whole phrase', () => {
		const web = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		createTicket(web.key, { title: 'Rechnung als PDF exportieren' }, 'owner');
		createTicket(web.key, { title: 'Export', description: 'Die Rechnung soll auch als PDF gehen' }, 'owner');
		createTicket(web.key, { title: 'Rechnung exportieren', description: 'Rechnung exportieren wie bisher' }, 'owner');
		createTicket(web.key, { title: 'Nur Rechnung' }, 'owner');

		// Ganzer Ausdruck zuerst, dann alle Wörter im Titel, dann Wörter auch aus der Beschreibung
		expect(keys('owner', 'rechnung exportieren')).toEqual(['WEB-3', 'WEB-1']);
		expect(keys('owner', 'rechnung pdf')).toEqual(['WEB-1', 'WEB-2']);
		// Schlüssel zählt als Wort
		expect(keys('owner', 'web-4 rechnung')).toEqual(['WEB-4']);
	});

	it('only finds tickets of projects the user can see', () => {
		const web = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		const secret = createProject({ name: 'Geheim', key: 'SEC' }, 'owner');
		createTicket(web.key, { title: 'Login reparieren' }, 'owner');
		createTicket(secret.key, { title: 'Login für Admins' }, 'owner');
		expect(keys('reader', 'login')).toEqual([]);
		addMember('owner', web.id, { user: 'reader', role: 'reader' });
		expect(keys('reader', 'login')).toEqual(['WEB-1']);
		expect(keys('owner', 'login').sort()).toEqual(['SEC-1', 'WEB-1']);
	});
});
