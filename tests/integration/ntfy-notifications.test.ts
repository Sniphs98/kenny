import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.js';
import { project, user } from '#lib/server/db/schema.js';
import { createForm } from '#lib/server/services/intake.js';
import { getNtfyNotifications } from '#lib/server/services/ntfy-notifications.js';
import { createProject } from '#lib/server/services/projects.js';
import { createTicket } from '#lib/server/services/tickets.js';
import { addMember } from '#lib/server/services/users.js';
import { addPublicTicketComment, publicTicketStatusUrlToken } from '#lib/server/services/public-ticket-status.js';

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'owner', name: 'Olga Owner', email: 'owner@example.com' },
			{ id: 'member', name: 'Max Member', email: 'member@example.com' }
		])
		.run();
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(null, { status: 200 }))
	);
});

afterEach(() => vi.unstubAllGlobals());

describe('ntfy notifications', () => {
	it('sends ticket-created notifications only for tickets submitted through a form', () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		addMember('owner', p.id, { user: 'member', role: 'member' });
		getNtfyNotifications('member');

		createTicket(p.key, { title: 'Internal task' }, 'owner');
		expect(fetch).not.toHaveBeenCalled();

		const form = createForm({ name: 'Support', projectIds: [p.id] }, 'owner');
		createTicket(p.key, { title: 'Form ticket' }, null, { intakeFormId: form.id, reporterEmail: null });
		expect(fetch).toHaveBeenCalledOnce();
	});

	it('notifies assignees, or all members when unassigned, about public form-ticket comments', () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		addMember('owner', p.id, { user: 'member', role: 'member' });
		const ownerNtfy = getNtfyNotifications('owner');
		getNtfyNotifications('member');
		const form = createForm({ name: 'Support', projectIds: [p.id] }, 'owner');

		const unassigned = createTicket(p.key, { title: 'Unassigned form ticket' }, null, {
			intakeFormId: form.id,
			reporterEmail: null
		});
		vi.mocked(fetch).mockClear();
		addPublicTicketComment(
			unassigned.key,
			publicTicketStatusUrlToken(unassigned.id)!,
			{ body: 'Any news?' },
			'127.0.0.1'
		);
		expect(fetch).toHaveBeenCalledTimes(2);

		const assigned = createTicket(p.key, { title: 'Assigned form ticket', assignee: 'owner' }, null, {
			intakeFormId: form.id,
			reporterEmail: null
		});
		vi.mocked(fetch).mockClear();
		addPublicTicketComment(
			assigned.key,
			publicTicketStatusUrlToken(assigned.id)!,
			{ body: 'Please help' },
			'127.0.0.2'
		);
		expect(fetch).toHaveBeenCalledOnce();
		expect(fetch).toHaveBeenCalledWith(expect.stringContaining(ownerNtfy.topic!), expect.anything());
	});
});
