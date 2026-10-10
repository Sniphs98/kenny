import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
	projectListItemSchema,
	ticketDetailSchema,
	ticketSearchResultSchema,
	ticketSearchSchema
} from '$lib/contracts';
import { localizeError } from '$lib/i18n';
import { ApiError } from './errors';
import { listProjects } from './services/projects';
import { searchTickets, viewTicket } from './services/tickets';

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const search = ticketSearchSchema.shape;

/** Antwort eines Tools als JSON-Text; fachliche Fehler gehen als Tool-Fehler an das Modell zurück */
function run(fn: () => unknown): CallToolResult {
	try {
		return { content: [{ type: 'text', text: JSON.stringify(fn(), null, 2) }] };
	} catch (e) {
		if (!(e instanceof ApiError)) console.error(e);
		const message = e instanceof ApiError ? e.message : 'Interner Fehler';
		return { isError: true, content: [{ type: 'text', text: localizeError(message) }] };
	}
}

/**
 * MCP-Server für einen Benutzer: nur lesende Tools, die genau die Projekte und Tickets
 * liefern, die der Benutzer auch über die REST-API sehen darf.
 */
export function createMcpServer(userId: string) {
	const server = new McpServer(
		{ name: 'kenny', version: '1.0.0' },
		{
			instructions:
				'Kenny is a project and ticket tracker. Tickets have keys like WEB-12 (project key + number). ' +
				'Use list_projects to discover projects, search_tickets to find tickets and get_ticket for details. ' +
				'All tools are read-only and only return data the connected user is allowed to see.'
		}
	);

	server.registerTool(
		'list_projects',
		{
			title: 'List projects',
			description: 'Lists all projects the user can access, with their key and open/total ticket counts.',
			annotations: readOnly
		},
		() => run(() => projectListItemSchema.array().parse(listProjects(userId)))
	);

	server.registerTool(
		'search_tickets',
		{
			title: 'Search tickets',
			description:
				'Finds tickets across all accessible projects (or one project). Returns at most `limit` tickets ' +
				'(default 50) ordered by project and board position, plus the total number of matches.',
			inputSchema: {
				project: search.project.describe('Project key (e.g. "WEB") or numeric id. Omit to search all projects.'),
				query: search.query.describe('Case-insensitive text matched against ticket key, title and description.'),
				assignee: search.assignee.describe(
					'"me" for the user\'s own tickets, "none" for unassigned, or a user id/email.'
				),
				closed: search.closed.describe('true for completed tickets only, false for open tickets only. Omit for both.'),
				limit: search.limit.describe('Maximum number of tickets to return (1–200, default 50).')
			},
			annotations: readOnly
		},
		(args) => run(() => ticketSearchResultSchema.parse(searchTickets(userId, args)))
	);

	server.registerTool(
		'get_ticket',
		{
			title: 'Get ticket',
			description:
				'Returns one ticket with description, status, assignee, tags, parent, subtasks, links and attachment metadata.',
			inputSchema: { ticket: z.string().trim().min(1).max(120).describe('Ticket key (e.g. "WEB-12") or numeric id.') },
			annotations: readOnly
		},
		({ ticket }) => run(() => ticketDetailSchema.parse(viewTicket(ticket, userId)))
	);

	return server;
}
