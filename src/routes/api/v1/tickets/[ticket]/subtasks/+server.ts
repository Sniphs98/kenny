import { ticketDtoSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { createTicket, resolveTicket } from '#lib/server/services/tickets.js';

/** Unteraufgabe zu einem Ticket anlegen; Body wie beim Anlegen eines Tickets */
export const POST = apiHandler(
	async (e, user) => {
		const parent = resolveTicket(e.params.ticket!);
		return createTicket(parent.projectId, { ...(await readJson(e)), kind: parent.kind === 'version' ? 'main' : 'task', parentId: parent.id }, user.id);
	},
	{ status: 201, responseSchema: ticketDtoSchema }
);
