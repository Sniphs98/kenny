import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/server/db';
import { project, user } from '$lib/server/db/schema';
import { createForm } from '$lib/server/services/intake';
import {
	getNotifications,
	sendTestNotification,
	settleNotifications,
	updateNotifications
} from '$lib/server/services/notifications';
import { createProject, deleteProject } from '$lib/server/services/projects';
import { closeTicket, createTicket, reopenTicket, updateTicket } from '$lib/server/services/tickets';
import { addMember } from '$lib/server/services/users';

const WEBHOOK =
	'https://prod-01.westeurope.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=GEHEIM';

type Card = {
	attachments: {
		contentType: string;
		content: { body: { type: string; inlines?: { type: string; text: string }[] }[]; actions?: { url: string }[] };
	}[];
};

/** Zugestellte Karten (fetch ist die externe Grenze und wird ersetzt) */
let sent: { url: string; init: RequestInit; card: Card }[] = [];
let respond: () => Response | Promise<Response> = () => new Response(null, { status: 202 });

const lines = (card: Card) =>
	card.attachments[0].content.body.map((block) => (block.inlines ?? []).map((i) => i.text).join(''));

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'owner', name: 'Olga Owner', email: 'owner@example.com' },
			{ id: 'member', name: 'Max Member', email: 'member@example.com' }
		])
		.run();
	sent = [];
	respond = () => new Response(null, { status: 202 });
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			sent.push({ url, init, card: JSON.parse(String(init.body)) });
			return respond();
		})
	);
});

afterEach(() => vi.unstubAllGlobals());

function setup(options: Record<string, unknown> = {}) {
	const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
	addMember('owner', p.id, { user: 'member', role: 'member' });
	updateNotifications(p.key, { webhookUrl: WEBHOOK, ...options }, 'owner');
	return p;
}

describe('notification settings', () => {
	it('lets only project administrators configure and never returns the webhook address', () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		addMember('owner', p.id, { user: 'member', role: 'member' });
		expect(() => updateNotifications(p.key, { webhookUrl: WEBHOOK }, 'member')).toThrow(/Unzureichende/);
		expect(() => getNotifications(p.key, 'member')).toThrow(/Unzureichende/);
		expect(getNotifications(p.key, 'owner')).toMatchObject({ configured: false, webhookHost: null });

		const saved = updateNotifications(p.key, { webhookUrl: WEBHOOK, events: ['closed', 'created'] }, 'owner');
		expect(saved).toMatchObject({
			configured: true,
			webhookHost: 'prod-01.westeurope.logic.azure.com',
			events: ['created', 'closed'],
			locale: 'de'
		});
		expect(JSON.stringify(getNotifications(p.key, 'owner'))).not.toContain('GEHEIM');

		// Ohne neue Adresse bleibt die alte; null entfernt die Einrichtung
		expect(updateNotifications(p.key, { locale: 'en' }, 'owner')).toMatchObject({ configured: true, locale: 'en' });
		expect(updateNotifications(p.key, { webhookUrl: null }, 'owner').configured).toBe(false);
		expect(() => updateNotifications(p.key, { events: ['closed'] }, 'owner')).toThrow(/Webhook-Adresse/);
	});

	it('only accepts HTTPS addresses of Microsoft workflows (no SSRF into the network)', () => {
		const p = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		for (const url of [
			'http://prod-01.westeurope.logic.azure.com/workflows/abc',
			'https://evil.example/hook',
			'https://localhost/hook',
			'https://127.0.0.1/hook',
			'https://10.0.0.5/hook',
			'https://logic.azure.com.evil.example/hook',
			'https://logic.azure.com/hook',
			'https://user:pass@prod-01.westeurope.logic.azure.com/hook',
			'file:///etc/passwd'
		])
			expect(() => updateNotifications(p.key, { webhookUrl: url }, 'owner'), url).toThrow(/Webhook-Adresse/);
		for (const url of [
			WEBHOOK,
			'https://de0a0b.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/x',
			'https://prod.westeurope.powerautomate.com/hook'
		])
			expect(updateNotifications(p.key, { webhookUrl: url }, 'owner').configured, url).toBe(true);
	});
});

describe('notification delivery', () => {
	it('posts new, assigned and completed tickets once each', async () => {
		const p = setup();
		const t = createTicket(p.key, { title: 'Login klemmt', priority: 'high', dueDate: '2026-11-01' }, 'owner');
		await settleNotifications();
		expect(sent).toHaveLength(1);
		expect(sent[0].url).toBe(WEBHOOK);
		expect(sent[0].init).toMatchObject({ method: 'POST', redirect: 'error' });
		expect(sent[0].card.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
		expect(lines(sent[0].card)).toEqual([
			'Neues Ticket WEB-1',
			'Login klemmt',
			'Projekt: Web',
			'Priorität: Hoch',
			'Zuständig: Niemand',
			'Fällig: 2026-11-01'
		]);
		expect(sent[0].card.attachments[0].content.actions?.[0].url).toMatch(/\/tickets\/WEB-1$/);

		updateTicket(t.key, { assignee: 'member' });
		updateTicket(t.key, { assignee: 'member', title: 'Login klemmt immer noch' });
		await settleNotifications();
		expect(sent.map((s) => lines(s.card)[0])).toEqual(['Neues Ticket WEB-1', 'WEB-1 zugewiesen an Max Member']);

		closeTicket(t.key);
		closeTicket(t.key);
		reopenTicket(t.key);
		await settleNotifications();
		expect(sent.map((s) => lines(s.card)[0]).slice(2)).toEqual(['Ticket WEB-1 erledigt']);

		// Ein neues Ticket mit Zuständigem meldet beides
		createTicket(p.key, { title: 'Direkt zugewiesen', assignee: 'member' }, 'owner');
		await settleNotifications();
		expect(sent.map((s) => lines(s.card)[0]).slice(3)).toEqual([
			'Neues Ticket WEB-2',
			'WEB-2 zugewiesen an Max Member'
		]);
	});

	it('follows the selected events and language and stops after removal', async () => {
		const p = setup({ events: ['closed'], locale: 'en' });
		const t = createTicket(p.key, { title: 'Quiet' }, 'owner');
		updateTicket(t.key, { assignee: 'member' });
		closeTicket(t.key);
		await settleNotifications();
		expect(sent.map((s) => lines(s.card)[0])).toEqual(['Ticket WEB-1 completed']);
		expect(lines(sent[0].card)).toContain('Assignee: Max Member');

		updateNotifications(p.key, { webhookUrl: null }, 'owner');
		createTicket(p.key, { title: 'After removal' }, 'owner');
		await settleNotifications();
		expect(sent).toHaveLength(1);

		// Mit dem Projekt verschwindet auch die Einrichtung
		updateNotifications(p.key, { webhookUrl: WEBHOOK }, 'owner');
		await deleteProject(p.id);
		const again = createProject({ name: 'Web', key: 'WEB' }, 'owner');
		expect(getNotifications(again.key, 'owner').configured).toBe(false);
	});

	it('names the form of submitted tickets and keeps user text as plain text', async () => {
		const p = setup();
		const form = createForm({ name: 'Support', projectIds: [p.id] }, 'owner');
		createTicket(p.key, { title: '[Hier klicken](https://evil.example) **dringend**' }, null, {
			intakeFormId: form.id,
			reporterEmail: null
		});
		await settleNotifications();
		const body = sent[0].card.attachments[0].content.body;
		expect(lines(sent[0].card).slice(0, 3)).toEqual([
			'Neues Ticket WEB-1',
			'[Hier klicken](https://evil.example) **dringend**',
			'Eingereicht über „Support“'
		]);
		// Nur TextRuns: Adaptive Cards werten darin kein Markdown aus
		expect(body.every((block) => block.type === 'RichTextBlock')).toBe(true);
		expect(body.flatMap((block) => block.inlines ?? []).every((i) => i.type === 'TextRun')).toBe(true);
	});

	it('keeps tickets working when Teams is unreachable and reports the error', async () => {
		const p = setup();
		respond = () => new Response('nope', { status: 500 });
		const t = createTicket(p.key, { title: 'Trotzdem gespeichert' }, 'owner');
		expect(t.key).toBe('WEB-1');
		await settleNotifications();
		expect(getNotifications(p.key, 'owner')).toMatchObject({ lastError: 'HTTP 500', lastSentAt: null });

		await expect(sendTestNotification(p.key, 'owner')).rejects.toThrow('Testnachricht fehlgeschlagen: HTTP 500');

		respond = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));
		closeTicket(t.key);
		await settleNotifications();
		expect(getNotifications(p.key, 'owner').lastError).toBe('getaddrinfo ENOTFOUND');

		respond = () => new Response(null, { status: 202 });
		const result = await sendTestNotification(p.key, 'owner');
		expect(result.lastError).toBeNull();
		expect(result.lastSentAt).toBeInstanceOf(Date);
		expect(lines(sent.at(-1)!.card)).toEqual([
			'Kenny ist verbunden',
			'Benachrichtigungen aus dem Projekt „Web“ erscheinen ab jetzt in diesem Kanal.'
		]);

		updateNotifications(p.key, { webhookUrl: null }, 'owner');
		await expect(sendTestNotification(p.key, 'owner')).rejects.toThrow(/keine Benachrichtigungen eingerichtet/);
		await expect(sendTestNotification(p.key, 'member')).rejects.toThrow(/Unzureichende/);
	});
});
