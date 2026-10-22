import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmail } = vi.hoisted(() => ({
	sendEmail: vi.fn(
		async (_mail: {
			to: string;
			fromName?: string;
			subject: string;
			text: string;
			html?: string;
			attachments?: unknown[];
		}) => {}
	)
}));
vi.mock('#lib/server/email/smtp.js', () => ({ sendEmail, isSmtpConfigured: () => true }));

import { db } from '#lib/server/db/index.js';
import { project, user } from '#lib/server/db/schema.js';
import {
	getEmailNotifications,
	sendTestEmailNotification,
	settleEmailNotifications,
	updateEmailNotifications
} from '#lib/server/services/email-notifications.js';
import { createForm } from '#lib/server/services/intake.js';
import { createProject } from '#lib/server/services/projects.js';
import { addComment, closeTicket, createTicket } from '#lib/server/services/tickets.js';
import {
	addPublicTicketComment,
	getPublicTicketStatus,
	publicTicketStatusUrlToken
} from '#lib/server/services/public-ticket-status.js';
import { addMember } from '#lib/server/services/users.js';

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'owner', name: 'Olga Owner', email: 'owner@example.com' },
			{ id: 'member', name: 'Max Member', email: 'member@example.com' }
		])
		.run();
	sendEmail.mockClear();
});

afterEach(async () => settleEmailNotifications());

describe('email notification settings', () => {
	it('lets project administrators select events', async () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		addMember('owner', p.id, { user: 'member', role: 'member' });
		expect(() => updateEmailNotifications(p.key, { enabled: true }, 'member')).toThrow(/Unzureichende/);
		expect(
			updateEmailNotifications(
				p.key,
				{ enabled: true, events: ['closed'], senderName: 'e.complete Support' },
				'owner'
			)
		).toMatchObject({
			configured: true,
			smtpConfigured: true,
			events: ['closed'],
			senderName: 'e.complete Support'
		});
		await sendTestEmailNotification(p.key, 'owner');
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'owner@example.com',
				fromName: 'e.complete Support',
				html: expect.stringContaining('<html lang="de">')
			})
		);
		expect(sendEmail.mock.calls[0][0].html).toContain('cid:ecomplete-brand');
		expect(sendEmail.mock.calls[0][0].html).not.toContain('Kenny');
		expect(sendEmail.mock.calls[0][0].html).toContain('background:#fafaf9');
		expect(updateEmailNotifications(p.key, { enabled: false }, 'owner').configured).toBe(false);
		expect(getEmailNotifications(p.key, 'owner').configured).toBe(false);
	});
});

describe('email notification delivery', () => {
	it('sends selected events only for form tickets to their submitter', async () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		updateEmailNotifications(
			p.key,
			{ enabled: true, events: ['created', 'closed', 'public_comment'] },
			'owner'
		);
		const regular = createTicket(p.key, { title: 'Interne Aufgabe' }, 'owner');
		addComment(regular.key, { body: 'Öffentlich, aber kein Formular-Ticket', internal: false }, 'owner');
		closeTicket(regular.key);
		const form = createForm({ name: 'Support', projectIds: [p.id] }, 'owner');
		createTicket(p.key, { title: 'Ohne Rückadresse' }, null, {
			intakeFormId: form.id,
			reporterEmail: null
		});
		const t = createTicket(p.key, { title: 'Login <klemmt>', description: 'Bitte **schnell** prüfen' }, null, {
			intakeFormId: form.id,
			reporterEmail: 'submitter@example.com'
		});
		addComment(t.key, { body: 'Nur intern', internal: true }, 'owner');
		addComment(t.key, { body: 'Für den Kunden sichtbar', internal: false }, 'owner');
		closeTicket(t.key);
		await settleEmailNotifications();

		expect(sendEmail).toHaveBeenCalledTimes(3);
		expect(sendEmail.mock.calls.map(([mail]) => mail.subject)).toEqual([
			'Ticket „Login <klemmt>“ wurde erstellt',
			'Neue Antwort zu deinem Ticket „Login <klemmt>“',
			'Ticket „Login <klemmt>“ wurde abgeschlossen'
		]);
		expect(sendEmail.mock.calls[1][0]).toMatchObject({ to: 'submitter@example.com' });
		expect(sendEmail.mock.calls[1][0].text).toContain('Für den Kunden sichtbar');
		expect(sendEmail.mock.calls[0][0].text).toContain('Dein Ticket wurde erstellt und wird bearbeitet.');
		expect(sendEmail.mock.calls[0][0].html).toContain('Deine Angaben');
		expect(sendEmail.mock.calls[0][0].html).toContain('Web · Support');
		expect(sendEmail.mock.calls[0][0].html).toContain('Login &lt;klemmt&gt;');
		expect(sendEmail.mock.calls[0][0].html).toContain('Bitte <strong>schnell</strong> prüfen');
		expect(sendEmail.mock.calls[0][0].html).toContain(`/status/${t.key}/`);
		expect(sendEmail.mock.calls[0][0].html).not.toContain(`/tickets/${t.key}`);
		expect(sendEmail.mock.calls[2][0].html).toContain('Bitte <strong>schnell</strong> prüfen');
		expect(sendEmail.mock.calls[1][0].html).toContain('Für den Kunden sichtbar');
		expect(sendEmail.mock.calls[1][0].html).not.toContain('Deine Angaben');
	});

	it('grants the submitter access only to status and public comments through the signed link', () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		addMember('owner', p.id, { user: 'member', role: 'member' });
		const form = createForm({ name: 'Support', projectIds: [p.id] }, 'owner');
		const t = createTicket(
			p.key,
			{ title: 'Login kaputt', description: 'Öffentliche Beschreibung', assignees: ['member'], tags: ['Bug'] },
			null,
			{
				intakeFormId: form.id,
				reporterEmail: 'submitter@example.com',
				systemName: 'ERP'
			}
		);
		addComment(t.key, { body: 'Interne Notiz', internal: true }, 'owner');
		addComment(t.key, { body: 'Öffentliche Antwort', internal: false }, 'owner');
		const token = publicTicketStatusUrlToken(t.id)!;

		expect(() => getPublicTicketStatus(t.key, 'x'.repeat(43))).toThrow(/Status-Link/);
		expect(getPublicTicketStatus(t.key, token)).toMatchObject({
			key: t.key,
			title: 'Login kaputt',
			description: 'Öffentliche Beschreibung',
			system: 'ERP',
			createdBy: null,
			assignees: ['Max Member'],
			tags: [{ name: 'Bug', color: '#ef4444' }],
			closed: false,
			comments: [{ body: 'Öffentliche Antwort', isReporter: false }]
		});

		const updated = addPublicTicketComment(t.key, token, { body: 'Danke für die Rückmeldung' }, '203.0.113.10');
		expect(updated.comments.at(-1)).toMatchObject({ body: 'Danke für die Rückmeldung', isReporter: true });
		expect(updated.comments.map((comment) => comment.body)).not.toContain('Interne Notiz');
	});
});
