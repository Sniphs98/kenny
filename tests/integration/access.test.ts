import { ne } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/server/db/index.js';
import { account, apiToken, attachment, project, projectMember, session, user } from '#lib/server/db/schema.js';
import {
	addMember,
	bootstrapAdministrator,
	changeMember,
	createManagedUser,
	registrationAllowed,
	listManagedUsers,
	listMembers,
	listMemberCandidates,
	getManagedUser,
	listUserProjects,
	assignUserProject,
	changeUserProject,
	updateUser
} from '#lib/server/services/users.js';
import {
	authorizeResource,
	projectUsers,
	requireActiveUser,
	requireAdmin,
	requireProjectAccess,
	visibleUsers
} from '#lib/server/services/access.js';
import { createProject, listProjects } from '#lib/server/services/projects.js';
import {
	addComment,
	deleteComment,
	addLink,
	createTicket,
	getTicketDetail,
	listComments,
	listTickets,
	listDependencies,
	removeLink,
	searchTickets,
	subscribeToTicket,
	unsubscribeFromTicket,
	updateTicket,
	viewTicket
} from '#lib/server/services/tickets.js';
import { ApiError } from '#lib/server/errors.js';

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
	it('stores markdown comments on every task kind with author, date and display status', () => {
		const { p, t } = fixture();
		const version = createTicket(p.key, { title: 'Version', kind: 'version' }, 'owner');
		const main = createTicket(p.key, { title: 'Main', kind: 'main', parentId: version.id }, 'owner');
		for (const item of [version, main, t]) {
			const created = addComment(item.id, { body: '  **Hello**  ', internal: true }, 'member');
			expect(created).toMatchObject({
				ticketId: item.id,
				body: '**Hello**',
				internal: true,
				authorId: 'member',
				authorName: 'Member'
			});
			expect(created.createdAt).toBeInstanceOf(Date);
			expect(viewTicket(item.id, 'reader').comments).toEqual([created]);
			expect(getTicketDetail(item.id).comments).toEqual([created]);
		}
		const publicComment = addComment(t.id, { body: 'Public', internal: false }, 'owner');
		expect(listComments(t.id, 'reader').map((comment) => comment.internal)).toEqual([true, false]);
		expect(publicComment.authorName).toBe('Owner');
		denied(() => addComment(t.id, { body: 'No', internal: false }, 'reader'), 403);
		denied(() => listComments(t.id, 'outsider'), 404);
		denied(() => addComment(t.id, { body: 'No', internal: false }, 'outsider'), 404);
		denied(() => addComment(t.id, { body: '   ', internal: false }, 'member'), 400);
		expect(listComments(t.id, 'owner')).toHaveLength(2);
		deleteComment(t.id, publicComment.id, 'member');
		expect(listComments(t.id, 'owner')).toHaveLength(1);
		const remainingCommentId = listComments(t.id, 'owner')[0]!.id;
		denied(() => deleteComment(t.id, remainingCommentId, 'reader'), 403);
		denied(() => deleteComment(t.id, remainingCommentId, 'outsider'), 404);
		denied(() => deleteComment(t.id, publicComment.id, 'member'), 404);
	});
	it('lets only instance administrators manage projects per user using the existing membership rules', () => {
		const { p } = fixture();
		const other = createProject({ name: 'Other', key: 'OTHER' }, 'outsider');
		expect(getManagedUser('root', 'member').id).toBe('member');
		expect(listUserProjects('root', 'member')).toEqual([{ projectId: p.id, key: p.key, name: p.name, role: 'member' }]);
		denied(() => listUserProjects('owner', 'member'), 403);
		denied(() => getManagedUser('owner', 'member'), 403);
		denied(() => assignUserProject('owner', 'member', { projectId: other.id, role: 'admin' }), 403);
		denied(() => changeUserProject('owner', 'member', p.id, { role: 'admin' }), 403);
		denied(() => listUserProjects('root', 'missing'), 404);
		denied(() => assignUserProject('root', 'member', { projectId: p.id, role: 'reader' }), 409);
		denied(() => assignUserProject('root', 'missing', { projectId: other.id, role: 'reader' }), 404);
		denied(() => assignUserProject('root', 'member', { projectId: 999999, role: 'reader' }), 404);
		denied(() => assignUserProject('root', 'member', { projectId: other.id, role: 'reader', user: 'root' }), 400);
		expect(assignUserProject('root', 'member', { projectId: other.id, role: 'reader' }).role).toBe('reader');
		denied(() => requireProjectAccess('member', other.id, 'member'), 403);
		changeUserProject('root', 'member', other.id, { role: 'member' });
		expect(requireProjectAccess('member', other.id, 'member')).toBe('member');
		changeUserProject('root', 'member', other.id, null);
		denied(() => requireProjectAccess('member', other.id), 404);
		denied(() => changeUserProject('root', 'owner', p.id, null), 409);
		denied(() => changeUserProject('root', 'missing', p.id, null), 404);
		updateUser('root', 'member', { active: false });
		expect(listUserProjects('root', 'member')).toHaveLength(1);
		denied(() => assignUserProject('root', 'member', { projectId: other.id, role: 'reader' }), 401);
	});
	it('offers only active, visible non-members to project managers', () => {
		const { p } = fixture();
		expect(listMemberCandidates('root', p.id).map((u) => u.id)).toEqual(['root', 'outsider']);
		expect(listMemberCandidates('owner', p.id)).toEqual([]);
		denied(() => listMemberCandidates('reader', p.id), 403);
		denied(() => listMemberCandidates('outsider', p.id), 404);
		const shared = createProject({ name: 'Shared directory', key: 'SHARE' }, 'owner');
		addMember('owner', shared.id, { user: 'outsider', role: 'member' });
		expect(listMemberCandidates('owner', p.id)).toEqual([
			{ id: 'outsider', name: 'Outsider', email: 'outsider@example.com' }
		]);
		updateUser('root', 'outsider', { active: false });
		expect(listMemberCandidates('owner', p.id)).toEqual([]);
		expect(listMemberCandidates('root', p.id).map((u) => u.id)).toEqual(['root']);
	});
	it('creates credential accounts atomically without granting project or administrator rights', async () => {
		expect(registrationAllowed()).toBe(false);
		const input = { name: 'Created', email: 'CREATED@example.com', password: 'secure-test-password' };
		await expect(createManagedUser('member', input)).rejects.toMatchObject({ status: 403 });
		const created = await createManagedUser('root', input);
		expect(created).toMatchObject({
			email: 'created@example.com',
			active: true,
			role: 'user',
			providers: ['credential']
		});
		expect(created).not.toHaveProperty('password');
		expect(listProjects(created.id)).toEqual([]);
		await expect(createManagedUser('root', input)).rejects.toMatchObject({ status: 409 });
		await expect(createManagedUser('root', { ...input, role: 'admin' })).rejects.toMatchObject({ status: 400 });
	});
	it('does not count disabled accounts when protecting the last project administrator', () => {
		const { p } = fixture();
		addMember('owner', p.id, { user: 'outsider', role: 'admin' });
		updateUser('root', 'outsider', { active: false });
		denied(() => changeMember('owner', p.id, 'owner', null), 409);
		denied(() => changeMember('owner', p.id, 'owner', { role: 'reader' }), 409);
		updateUser('root', 'outsider', { active: true });
		changeMember('owner', p.id, 'owner', { role: 'member' });
	});
	it('protects both projects when deleting links and hides inaccessible dependency targets', () => {
		const { p, t } = fixture();
		const other = createProject({ name: 'Secret', key: 'SECRET' }, 'outsider');
		const secret = createTicket(other.key, { title: 'Secret' }, 'outsider');
		const link = addLink(t.id, { target: secret.id, type: 'depends_on' }, 'root');
		expect(listDependencies(p.id, 'reader')).toEqual([]);
		expect(listDependencies(p.id, 'root')).toHaveLength(1);
		denied(() => removeLink(t.id, link.id, 'owner'), 404);
		addMember('outsider', other.id, { user: 'owner', role: 'reader' });
		expect(listDependencies(p.id, 'owner')).toHaveLength(1);
		denied(() => removeLink(t.id, link.id, 'owner'), 403);
		changeMember('outsider', other.id, 'owner', { role: 'member' });
		removeLink(t.id, link.id, 'owner');
		expect(listDependencies(p.id, 'root')).toEqual([]);
	});
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
	it('assigns several project members in order and keeps the single-assignee API compatible', () => {
		const { p, t } = fixture();
		const both = createTicket(
			p.key,
			{ title: 'Pair work', assignees: ['owner@example.com', 'member', 'owner'] },
			'owner'
		);
		expect(both).toMatchObject({ assigneeId: 'owner', assigneeIds: ['owner', 'member'] });
		const item = listTickets(p.id).find((x) => x.id === both.id)!;
		expect(item.assignees).toEqual([
			{ id: 'owner', name: 'Owner' },
			{ id: 'member', name: 'Member' }
		]);
		expect(item.assigneeName).toBe('Owner');
		expect(getTicketDetail(both.id).assignees.map((u) => u.email)).toEqual(['owner@example.com', 'member@example.com']);

		// Suche findet das Ticket bei jeder zuständigen Person
		expect(searchTickets('member', { assignee: 'me' }).tickets.map((x) => x.id)).toEqual([t.id, both.id]);
		expect(searchTickets('owner', { assignee: 'me' }).tickets.map((x) => x.id)).toEqual([both.id]);

		// Eine einzelne Person ersetzt die Liste, null leert sie
		expect(updateTicket(both.id, { assignee: 'member' }).assigneeIds).toEqual(['member']);
		expect(updateTicket(both.id, { assigneeId: null }).assigneeIds).toEqual([]);
		expect(searchTickets('owner', { assignee: 'none' }).tickets.map((x) => x.id)).toEqual([both.id]);

		// Fremde und unbekannte Personen werden abgelehnt, ohne die Liste halb zu übernehmen
		denied(() => updateTicket(both.id, { assignees: ['member', 'outsider'] }), 400);
		denied(() => updateTicket(both.id, { assignees: ['nobody@example.com'] }), 400);
		expect(getTicketDetail(both.id).ticket.assigneeIds).toEqual([]);
	});
	it('lets project members subscribe to a ticket independently of its assignees', () => {
		const { t } = fixture();
		expect(viewTicket(t.id, 'owner').subscribed).toBe(false);
		expect(subscribeToTicket(t.id, 'owner')).toEqual({ subscribed: true });
		expect(subscribeToTicket(t.id, 'owner')).toEqual({ subscribed: true });
		expect(viewTicket(t.id, 'owner').subscribed).toBe(true);
		expect(viewTicket(t.id, 'member').subscribed).toBe(false);
		expect(unsubscribeFromTicket(t.id, 'owner')).toEqual({ subscribed: false });
		expect(viewTicket(t.id, 'owner').subscribed).toBe(false);
		denied(() => subscribeToTicket(t.id, 'outsider'), 404);
	});
	it('inherits main-task assignees unless the task provides its own selection', () => {
		const { p } = fixture();
		const main = createTicket(p.key, { title: 'Main', kind: 'main', assignees: ['owner', 'member'] }, 'owner');

		const inherited = createTicket(p.key, { title: 'Inherited', parentId: main.id }, 'owner');
		expect(inherited.assigneeIds).toEqual(['owner', 'member']);

		const manual = createTicket(p.key, { title: 'Manual', parentId: main.id, assignees: [] }, 'owner');
		expect(manual.assigneeIds).toEqual([]);

		const existing = createTicket(p.key, { title: 'Existing', assignee: 'member' }, 'owner');
		expect(updateTicket(existing.id, { parentId: main.id }).assigneeIds).toEqual(['owner', 'member']);

		const overridden = createTicket(p.key, { title: 'Overridden' }, 'owner');
		expect(updateTicket(overridden.id, { parentId: main.id, assignee: 'member' }).assigneeIds).toEqual(['member']);
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
		// In der Liste darf eine deaktivierte Person zuständig bleiben, neu hinzufügen lässt sie sich nicht
		expect(updateTicket(t.id, { assignees: ['member', 'owner'] }).assigneeIds).toEqual(['member', 'owner']);
		updateTicket(t.id, { assignees: ['owner'] });
		denied(() => updateTicket(t.id, { assignees: ['owner', 'member'] }), 400);
		expect(getTicketDetail(t.id).ticket.assigneeIds).toEqual(['owner']);
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
