import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { project, user } from '$lib/server/db/schema';
import { createMcpServer } from '$lib/server/mcp';
import { createProject } from '$lib/server/services/projects';
import { addLink, closeTicket, createTicket, searchTickets } from '$lib/server/services/tickets';
import { addMember } from '$lib/server/services/users';

const clients: Client[] = [];

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'root', name: 'Admin', email: 'admin@example.com', role: 'admin' },
			{ id: 'owner', name: 'Owner', email: 'owner@example.com' },
			{ id: 'reader', name: 'Reader', email: 'reader@example.com' },
			{ id: 'outsider', name: 'Outsider', email: 'outsider@example.com' },
			{ id: 'locked', name: 'Locked', email: 'locked@example.com', active: false }
		])
		.run();
});
afterEach(async () => {
	await Promise.all(clients.splice(0).map((c) => c.close()));
});

function fixture() {
	const web = createProject({ name: 'Web', key: 'WEB' }, 'owner');
	addMember('owner', web.id, { user: 'reader', role: 'reader' });
	const secret = createProject({ name: 'Secret', key: 'SEC' }, 'owner');
	const login = createTicket('WEB', { title: 'Login bug', description: 'Password reset fails' }, 'owner');
	const mine = createTicket('WEB', { title: 'Docs', assignee: 'reader' }, 'owner');
	const done = createTicket('WEB', { title: 'Release' }, 'owner');
	closeTicket(done.id);
	const hidden = createTicket('SEC', { title: 'Hidden plan' }, 'owner');
	addLink(login.id, { target: hidden.key, type: 'relates' });
	return { web, secret, login, mine, done, hidden };
}

async function connect(userId: string) {
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await createMcpServer(userId).connect(serverSide);
	const client = new Client({ name: 'test', version: '1.0.0' });
	await client.connect(clientSide);
	clients.push(client);
	return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
	const result = await client.callTool({ name, arguments: args });
	const [content] = result.content as { type: string; text: string }[];
	return {
		isError: result.isError === true,
		text: content.text,
		data: result.isError ? null : JSON.parse(content.text)
	};
}

describe('MCP server', () => {
	it('offers only read-only tools', async () => {
		const { tools } = await (await connect('reader')).listTools();
		expect(tools.map((t) => t.name).sort()).toEqual(['get_ticket', 'list_projects', 'search_tickets']);
		for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
	});

	it('lists and searches only projects the user is a member of', async () => {
		const { login, mine } = fixture();
		const reader = await connect('reader');
		expect((await call(reader, 'list_projects')).data.map((p: { key: string }) => p.key)).toEqual(['WEB']);

		const all = (await call(reader, 'search_tickets')).data;
		expect(all.total).toBe(3);
		expect(all.tickets.map((t: { key: string }) => t.key)).not.toContain('SEC-1');

		expect((await call(reader, 'search_tickets', { assignee: 'me' })).data.tickets).toMatchObject([{ key: mine.key }]);
		expect((await call(reader, 'search_tickets', { query: 'password' })).data.tickets).toMatchObject([
			{ key: login.key }
		]);
		expect((await call(reader, 'search_tickets', { closed: true })).data.tickets).toMatchObject([{ title: 'Release' }]);
		expect((await call(reader, 'search_tickets', { limit: 1 })).data).toMatchObject({ total: 3, tickets: [{}] });

		const forbidden = await call(reader, 'search_tickets', { project: 'SEC' });
		expect(forbidden).toMatchObject({ isError: true, text: 'Project not found or access denied.' });
		expect((await call(await connect('outsider'), 'search_tickets')).data).toEqual({ total: 0, tickets: [] });
		expect((await call(await connect('root'), 'search_tickets')).data.total).toBe(4);
	});

	it('returns ticket details without links into inaccessible projects', async () => {
		const { login, hidden } = fixture();
		const reader = await connect('reader');
		const detail = (await call(reader, 'get_ticket', { ticket: login.key })).data;
		expect(detail).toMatchObject({ key: 'WEB-1', description: 'Password reset fails', links: [] });
		expect((await call(await connect('owner'), 'get_ticket', { ticket: login.key })).data.links).toMatchObject([
			{ ticket: { key: hidden.key } }
		]);
		expect(await call(reader, 'get_ticket', { ticket: hidden.key })).toMatchObject({ isError: true });
		expect(await call(reader, 'get_ticket', { ticket: String(hidden.id) })).toMatchObject({ isError: true });
		expect(await call(reader, 'get_ticket', { ticket: 'WEB-99' })).toMatchObject({
			isError: true,
			text: 'Ticket “WEB-99” not found.'
		});
	});

	it('rejects locked accounts and unknown or invisible assignees', async () => {
		fixture();
		expect(await call(await connect('locked'), 'list_projects')).toMatchObject({ isError: true });
		expect(() => searchTickets('reader', { assignee: 'outsider@example.com' })).toThrow(
			'Benutzer "outsider@example.com" nicht gefunden.'
		);
		expect(searchTickets('reader', { assignee: 'OWNER@example.com' }).total).toBe(0);
		expect(searchTickets('reader', { assignee: 'none' }).total).toBe(2);
		expect(() => searchTickets('reader', { limit: 0 })).toThrow();
		expect(() => searchTickets('reader', { unknown: true })).toThrow();
	});
});
