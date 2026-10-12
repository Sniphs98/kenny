import { ticketDtoSchema, ticketDetailSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { deleteTicket, getTicketDetail, updateTicket } from '#lib/server/services/tickets.js';

export const GET = apiHandler(
	(e, user) => {
		const { ticket, parent, subtasks, links, attachments, assignee, submission } = getTicketDetail(
			e.params.ticket!,
			user.id
		);
		return { ...ticket, parent, subtasks, links, attachments, assignee, submission };
	},
	{ responseSchema: ticketDetailSchema }
);
export const PATCH = apiHandler(async (e) => updateTicket(e.params.ticket!, await readJson(e)), {
	responseSchema: ticketDtoSchema
});
export const DELETE = apiHandler((e) => deleteTicket(e.params.ticket!));
