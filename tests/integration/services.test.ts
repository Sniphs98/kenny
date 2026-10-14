import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.js';
import { project } from '#lib/server/db/schema.js';
import { createProject, getProject, getColumns, updateColumn, deleteColumn } from '#lib/server/services/projects.js';
import {
	createTicket,
	updateTicket,
	getTicket,
	listTickets,
	addLink,
	closeTicket,
	reopenTicket,
	reorderTickets,
	getTicketDetail
} from '#lib/server/services/tickets.js';
import { createTag } from '#lib/server/services/tags.js';
import { ticketDtoSchema } from '#lib/contracts/index.js';

beforeEach(() => db.delete(project).run());

function fixture() {
	const p = createProject({ name: 'Web', key: 'WEB' }, null);
	const t = createTicket(p.key, { title: 'First ticket' }, null);
	return { p, t };
}

describe('services with real SQLite and migrations', () => {
	it('creates projects with columns and numbered tickets matching the public DTO', () => {
		const { p, t } = fixture();
		expect(getColumns(p.id)).toHaveLength(4);
		expect(t.key).toBe('WEB-1');
		expect(ticketDtoSchema.parse(t)).toEqual(t);
		expect(ticketDtoSchema.parse(JSON.parse(JSON.stringify(t))).createdAt).toBeInstanceOf(Date);
	});
	it('rolls back ticket creation, tags and the project counter on an invalid dependency', () => {
		const { p } = fixture();
		expect(() => createTicket(p.key, { title: 'Broken', tags: ['New tag'], dependsOn: ['WEB-999'] }, null)).toThrow();
		expect(listTickets(p.id)).toHaveLength(1);
		expect(getProject(p.id).ticketCounter).toBe(1);
		expect(createTicket(p.key, { title: 'Second' }, null).key).toBe('WEB-2');
	});
	it('rejects parent cycles and parents from another project', () => {
		const { p, t } = fixture();
		const child = createTicket(p.key, { title: 'Child', parentId: t.id }, null);
		expect(() => updateTicket(t.id, { parentId: child.id })).toThrow(/sich selbst/);
		const other = createProject({ name: 'Other', key: 'OTHER' }, null);
		expect(() => createTicket(other.key, { title: 'Wrong parent', parentId: t.id }, null)).toThrow(/selben Projekt/);
	});
	it('rejects dependency cycles across several tickets', () => {
		const { p, t } = fixture();
		const b = createTicket(p.key, { title: 'B', dependsOn: [t.id] }, null);
		const c = createTicket(p.key, { title: 'C', dependsOn: [b.id] }, null);
		expect(() => addLink(t.id, { target: c.id, type: 'depends_on' })).toThrow(/Zyklus/);
	});
	it('rejects columns and tags from other projects without applying a partial update', () => {
		const { t } = fixture();
		const other = createProject({ name: 'Other', key: 'OTHER' }, null);
		const tag = createTag(other.key, { name: 'Private tag' });
		expect(() => updateTicket(t.id, { title: 'Should rollback', tags: [tag.id] })).toThrow();
		expect(getTicket(t.id).title).toBe('First ticket');
		expect(() => updateTicket(t.id, { columnId: getColumns(other.id)[0].id })).toThrow();
	});
	it('validates PATCH dates against the stored date and permits explicit clearing', () => {
		const { t } = fixture();
		updateTicket(t.id, { startDate: '2026-10-10', dueDate: '2026-10-20' });
		expect(() => updateTicket(t.id, { dueDate: '2026-10-09' })).toThrow(/Startdatum/);
		expect(getTicket(t.id).dueDate).toBe('2026-10-20');
		updateTicket(t.id, { startDate: null });
		expect(getTicket(t.id).startDate).toBeNull();
		expect(getTicket(t.id).dueDate).toBe('2026-10-20');
	});
	it('moves and reorders tickets while maintaining completion status', () => {
		const { p, t } = fixture();
		const second = createTicket(p.key, { title: 'Second' }, null);
		updateTicket(second.id, { position: 0 });
		expect(listTickets(p.id).map((ticket) => ticket.id)).toEqual([second.id, t.id]);
		expect(closeTicket(t.id).closed).toBe(true);
		expect(reopenTicket(t.id).closed).toBe(false);
	});
	it('applies a manual column order atomically and keeps unlisted tickets behind it', () => {
		const { p, t } = fixture();
		const second = createTicket(p.key, { title: 'Second' }, null);
		const third = createTicket(p.key, { title: 'Third' }, null);
		expect(reorderTickets(p.key, { column: t.columnId, tickets: [third.id, t.id] })).toEqual({
			columnId: t.columnId,
			tickets: [third.id, t.id, second.id]
		});
		expect(listTickets(p.id).map((ticket) => ticket.id)).toEqual([third.id, t.id, second.id]);

		// Tickets anderer Spalten und doppelte Einträge lassen die Reihenfolge unverändert
		const elsewhere = createTicket(p.key, { title: 'Elsewhere', column: 'Review' }, null);
		expect(() => reorderTickets(p.key, { column: t.columnId, tickets: [second.id, elsewhere.id] })).toThrow(
			/nicht in dieser Spalte/
		);
		expect(() => reorderTickets(p.key, { column: t.columnId, tickets: [second.id, second.id] })).toThrow();
		expect(() => reorderTickets(p.key, { column: 'Missing', tickets: [second.id] })).toThrow(/Spalte/);
		const other = createProject({ name: 'Other', key: 'OTHER' }, null);
		expect(() => reorderTickets(other.key, { column: t.columnId, tickets: [t.id] })).toThrow(/Spalte/);
		expect(
			listTickets(p.id)
				.filter((ticket) => ticket.columnId === t.columnId)
				.map((ticket) => ticket.id)
		).toEqual([third.id, t.id, second.id]);
		expect(getTicket(elsewhere.id).position).toBe(0);
	});
	it('reports open prerequisites of subtasks in the ticket detail', () => {
		const { p, t } = fixture();
		const blocker = createTicket(p.key, { title: 'Blocker' }, null);
		const waiting = createTicket(p.key, { title: 'Waiting', parentId: t.id, dependsOn: [blocker.id] }, null);
		const free = createTicket(p.key, { title: 'Free', parentId: t.id }, null);
		const counts = () => new Map(getTicketDetail(t.id).subtasks.map((s) => [s.id, s.openBlockers]));
		expect(counts()).toEqual(
			new Map([
				[waiting.id, 1],
				[free.id, 0]
			])
		);
		closeTicket(blocker.id);
		expect(counts().get(waiting.id)).toBe(0);
	});
	it('updates ticket completion when a column changes and protects the last column', () => {
		const { p, t } = fixture();
		updateColumn(p.id, t.columnId, { isDone: true });
		expect(getTicket(t.id).closed).toBe(true);
		for (const column of getColumns(p.id).filter((column) => column.id !== t.columnId)) deleteColumn(p.id, column.id);
		expect(() => deleteColumn(p.id, t.columnId)).toThrow(/letzte Spalte/);
	});
	it('enforces contracts for direct service callers too', () => {
		const { t } = fixture();
		expect(() => updateTicket(t.id, { projectId: 123 })).toThrow(/Unrecognized|Unbekannt/);
		expect(() => updateTicket(t.id, { priority: 'critical' })).toThrow();
	});
});
