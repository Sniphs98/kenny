import { beforeEach, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.js';
import { project, user } from '#lib/server/db/schema.js';
import { createProject, deleteProject } from '#lib/server/services/projects.js';
import { addMember } from '#lib/server/services/users.js';
import { createBucket, updateBucket, deleteBucket, listBuckets } from '#lib/server/services/buckets.js';
import { createTicket, updateTicket, getTicket, listTickets, getTicketDetail } from '#lib/server/services/tickets.js';

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'owner', name: 'Owner', email: 'owner@example.com' },
			{ id: 'reader', name: 'Reader', email: 'reader@example.com' }
		])
		.run();
});

it('manages project buckets and rejects duplicate names, invalid input and unauthorized writes', () => {
	const p = createProject({ name: 'Buckets', key: 'BUCK' }, 'owner');
	addMember('owner', p.id, { user: 'reader', role: 'reader' });
	const b = createBucket('owner', p.id, { name: '  Frontend  ' });
	expect(b.name).toBe('Frontend');
	expect(() => createBucket('owner', p.id, { name: 'frontend' })).toThrow(/existiert/);
	expect(() => createBucket('owner', p.id, { name: '' })).toThrow();
	expect(() => createBucket('reader', p.id, { name: 'Forbidden' })).toThrow(/berechtigungen/);
	const second = createBucket('owner', p.id, { name: 'Backend' });
	expect(() => updateBucket('owner', p.id, second.id, { name: 'FRONTEND' })).toThrow(/existiert/);
	expect(updateBucket('owner', p.id, b.id, {}).name).toBe('Frontend');
	expect(updateBucket('owner', p.id, b.id, { name: 'UI' }).name).toBe('UI');
	expect(listBuckets(p.id)).toEqual([second, { id: b.id, name: 'UI' }]);
});

it('keeps bucket assignment project-scoped, preserves absent PATCH fields and clears null or deletion', async () => {
	const p = createProject({ name: 'Buckets', key: 'BUCK' }, 'owner');
	const other = createProject({ name: 'Other', key: 'OTHER' }, 'owner');
	const b = createBucket('owner', p.id, { name: 'Frontend' });
	const foreign = createBucket('owner', other.id, { name: 'Other bucket' });
	const t = createTicket(p.id, { title: 'Assigned', bucketId: b.id }, 'owner');
	expect(listTickets(p.id)[0].bucketId).toBe(b.id);
	expect(getTicketDetail(t.id).ticket.bucketId).toBe(b.id);
	expect(updateTicket(t.id, { title: 'Still assigned' }).bucketId).toBe(b.id);
	expect(() => updateTicket(t.id, { title: 'Rollback', bucketId: foreign.id })).toThrow(/Projekt/);
	expect(getTicket(t.id).title).toBe('Still assigned');
	expect(() => createTicket(p.id, { title: 'Forbidden', bucketId: foreign.id }, 'owner')).toThrow(/Projekt/);
	expect(listTickets(p.id)).toHaveLength(1);
	expect(() => deleteBucket('owner', p.id, foreign.id)).toThrow(/Projekt/);
	expect(() => updateBucket('owner', p.id, foreign.id, { name: 'Nope' })).toThrow(/Projekt/);
	expect(updateTicket(t.id, { bucketId: null }).bucketId).toBeNull();
	updateTicket(t.id, { bucketId: b.id });
	deleteBucket('owner', p.id, b.id);
	expect(getTicket(t.id).bucketId).toBeNull();
	expect(getTicket(t.id).title).toBe('Still assigned');
	await deleteProject(other.id);
	expect(listBuckets(other.id)).toEqual([]);
});
