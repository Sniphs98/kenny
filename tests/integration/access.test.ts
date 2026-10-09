import { ne } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { account, apiToken, attachment, project, projectMember, session, user } from '$lib/server/db/schema';
import {
	addMember,
	bootstrapAdministrator,
	changeMember,
	listManagedUsers,
	listMembers,
	updateUser
} from '$lib/server/services/users';
import {
	authorizeResource,
	projectUsers,
	requireActiveUser,
	requireAdmin,
	requireProjectAccess,
	visibleUsers
} from '$lib/server/services/access';
import { createProject, listProjects } from '$lib/server/services/projects';
import { addLink, createTicket, getTicketDetail, updateTicket } from '$lib/server/services/tickets';
import { ApiError } from '$lib/server/errors';

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'root', name: 'Admin', email: 'admin@example.com', role: 'admin', createdAt: new Date(1) },
			{ id: 'owner', name: 'Owner', email: 'owner@example.com', createdAt: new Date(2) },
			{ id: 'member', name: 'Member', email: 'member@example.com' },
			{ id: 'reader', name: 'Reader', email: 'reader@example.com' },
			{ id: 'outsider', name: 'Outsider', email: 'outsider@example.com' }
		])
		.run();
});
function fixture() {
	const p = createProject({ name: 'Private', key: 'PRIV' }, 'owner');
	addMember('owner', p.id, { user: 'member@example.com', role: 'member' });
	addMember('owner', p.id, { user: 'reader', role: 'reader' });
	const t = createTicket(p.key, { title: 'Private ticket', assignee: 'member' }, 'owner');
	return { p, t };
}
function denied(fn: () => unknown, status: number) {
	expect(fn).toThrow(ApiError);
	try {
		fn();
	} catch (e) {
		expect(e).toMatchObject({ status });
	}
}

describe('user management and project permissions', () => {
	it('bootstraps only the first registration without promoting subsequent accounts', () => {
		updateUser('root', 'owner', { role: 'admin' });
		updateUser('owner', 'root', { role: 'user' });
		bootstrapAdministrator();
		expect(requireActiveUser('member').role).toBe('user');
		bootstrapAdministrator();
		expect(requireActiveUser('root').role).toBe('user');
		db.delete(user).where(ne(user.id, 'root')).run();
		bootstrapAdministrator();
		expect(requireAdmin('root').role).toBe('admin');
	});
	it('filters projects and the directory by membership and checks each permission level', () => {
		const { p } = fixture();
		expect(listProjects('outsider')).toEqual([]);
		expect(listProjects('root')).toHaveLength(1);
		expect(listProjects('reader')).toHaveLength(1);
		expect(requireProjectAccess('root', p.id, 'admin')).toBe('admin');
		expect(requireProjectAccess('owner', p.id, 'admin')).toBe('admin');
		expect(requireProjectAccess('member', p.id, 'member')).toBe('member');
		expect(requireProjectAccess('reader', p.id)).toBe('reader');
		denied(() => requireProjectAccess('reader', p.id, 'member'), 403);
		denied(() => requireProjectAccess('member', p.id, 'admin'), 403);
		denied(() => requireProjectAccess('outsider', p.id), 404);
		expect(visibleUsers('outsider').map((u) => u.id)).toEqual(['outsider']);
		expect(visibleUsers('member').map((u) => u.id)).not.toContain('outsider');
		expect(visibleUsers('root')).toHaveLength(5);
		expect(projectUsers(p.id)).toHaveLength(3);
	});
	it('guards project, ticket and attachment resources for read, edit and management', () => {
		const { p, t } = fixture();
		const a = db
			.insert(attachment)
			.values({ ticketId: t.id, filename: 'fixture.txt', mimeType: 'text/plain', size: 3, storageKey: 'fixture' })
			.returning()
			.get();
		expect(authorizeResource('reader', 'GET', { project: p.key })).toBe('reader');
		expect(authorizeResource('reader', 'GET', { ticket: t.key })).toBe('reader');
		expect(authorizeResource('member', 'PATCH', { ticket: String(t.id) })).toBe('member');
		expect(authorizeResource('member', 'GET', { attachment: String(a.id) })).toBe('member');
		denied(() => authorizeResource('reader', 'DELETE', { attachment: String(a.id) }), 403);
		denied(() => authorizeResource('outsider', 'GET', { attachment: String(a.id) }), 404);
		denied(() => authorizeResource('member', 'PATCH', { project: p.key }, true), 403);
		denied(() => authorizeResource('root', 'GET', { attachment: '999' }), 404);
		expect(authorizeResource('root', 'GET', {})).toBeUndefined();
	});
	it('lists safe account details and restricts global role changes to administrators', () => {
		db.insert(account)
			.values({
				id: 'auth',
				accountId: 'microsoft-id',
				providerId: 'microsoft',
				userId: 'member',
				accessToken: 'private'
			})
			.run();
		const managed = listManagedUsers('root').find((u) => u.id === 'member');
		expect(managed?.providers).toEqual(['microsoft']);
		expect(managed).not.toHaveProperty('accessToken');
		denied(() => listManagedUsers('member'), 403);
		denied(() => updateUser('member', 'member', { role: 'admin' }), 403);
		denied(() => updateUser('root', 'missing', { active: true }), 404);
		expect(updateUser('root', 'member', { role: 'admin' }).role).toBe('admin');
		expect(updateUser('root', 'member', {}).role).toBe('admin');
	});
	it('protects the last active admin and revokes sessions and tokens when disabling an account', () => {
		const { p, t } = fixture();
		denied(() => updateUser('root', 'root', { active: false }), 409);
		denied(() => updateUser('root', 'root', { role: 'user' }), 409);
		db.insert(session)
			.values({ id: 'session', token: 'session-fixture', userId: 'member', expiresAt: new Date(Date.now() + 60000) })
			.run();
		db.insert(apiToken).values({ userId: 'member', name: 'Fixture', tokenHash: 'hash', prefix: 'prefix' }).run();
		updateUser('root', 'member', { active: false });
		expect(db.select().from(session).all()).toEqual([]);
		expect(db.select().from(apiToken).all()).toEqual([]);
		denied(() => requireActiveUser('member'), 401);
		expect(getTicketDetail(t.id).ticket.assigneeId).toBe('member');
		expect(projectUsers(p.id).map((u) => u.id)).not.toContain('member');
		expect(visibleUsers('root').map((u) => u.id)).not.toContain('member');
		expect(listMembers('owner', p.id).find((u) => u.id === 'member')?.active).toBe(false);
		denied(() => updateTicket(t.id, { assigneeId: 'member' }), 400);
		updateUser('root', 'member', { active: true });
		expect(requireActiveUser('member').active).toBe(true);
		expect(db.select().from(apiToken).all()).toEqual([]);
	});
	it('validates memberships, preserves the last project admin, and applies changes immediately', () => {
		const { p } = fixture();
		denied(() => addMember('member', p.id, { user: 'outsider', role: 'admin' }), 403);
		denied(() => addMember('owner', p.id, { user: 'missing', role: 'member' }), 404);
		denied(() => addMember('owner', p.id, { user: 'member', role: 'member' }), 409);
		denied(() => changeMember('owner', p.id, 'owner', null), 409);
		denied(() => changeMember('owner', p.id, 'owner', { role: 'reader' }), 409);
		denied(() => changeMember('owner', p.id, 'missing', null), 404);
		addMember('owner', p.id, { user: 'outsider', role: 'admin' });
		changeMember('outsider', p.id, 'member', { role: 'reader' });
		denied(() => requireProjectAccess('member', p.id, 'member'), 403);
		changeMember('outsider', p.id, 'owner', null);
		denied(() => requireProjectAccess('owner', p.id), 404);
		expect(listProjects('owner')).toEqual([]);
		denied(() => createTicket(p.key, { title: 'Assign outsider', assignee: 'owner' }, 'outsider'), 400);
		expect(db.select().from(projectMember).all()).toHaveLength(3);
	});
	it('does not disclose private linked tickets and rolls back unauthorized cross-project dependencies', () => {
		const { p, t } = fixture();
		const other = createProject({ name: 'Secret', key: 'SECRET' }, 'outsider');
		const secret = createTicket(other.key, { title: 'Confidential title' }, 'outsider');
		addLink(t.id, { target: secret.id, type: 'relates' }, 'root');
		expect(getTicketDetail(t.id, 'reader').links).toEqual([]);
		expect(getTicketDetail(t.id, 'root').links[0].ticket.title).toBe('Confidential title');
		denied(() => addLink(t.id, { target: secret.id, type: 'blocks' }, 'owner'), 404);
		denied(() => createTicket(p.key, { title: 'Unauthorized', dependsOn: [secret.id] }, 'owner'), 404);
	});
});
