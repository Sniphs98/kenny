import { ticketDtoSchema, ticketDetailSchema } from '$lib/contracts';
import { apiHandler, readJson } from '$lib/server/api';
import { deleteTicket, getTicketDetail, updateTicket } from '$lib/server/services/tickets';

export const GET = apiHandler(
	(e) => {
		const { ticket, parent, subtasks, links, attachments, assignee, submission } = getTicketDetail(e.params.ticket!);
		return { ...ticket, parent, subtasks, links, attachments, assignee, submission };
	},
	{ responseSchema: ticketDetailSchema }
);
export const PATCH = apiHandler(async (e) => updateTicket(e.params.ticket!, await readJson(e)), {
	responseSchema: ticketDtoSchema
});
export const DELETE = apiHandler((e) => deleteTicket(e.params.ticket!));
