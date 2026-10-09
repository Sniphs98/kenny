import { ticketDtoSchema } from '$lib/contracts';
import { apiHandler, readJson } from '$lib/server/api';
import { createTicket, resolveTicket } from '$lib/server/services/tickets';

/** Unteraufgabe zu einem Ticket anlegen; Body wie beim Anlegen eines Tickets */
export const POST = apiHandler(
	async (e, user) => {
		const parent = resolveTicket(e.params.ticket!);
		return createTicket(parent.projectId, { ...(await readJson(e)), parentId: parent.id }, user.id);
	},
	{ status: 201, responseSchema: ticketDtoSchema }
);
