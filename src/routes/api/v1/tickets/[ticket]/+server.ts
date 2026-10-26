import { ticketDtoSchema, ticketDetailSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { deleteTicket, updateTicket, viewTicket } from '#lib/server/services/tickets.js';

export const GET = apiHandler((e, user) => viewTicket(e.params.ticket!, user.id), {
	responseSchema: ticketDetailSchema
});
export const PATCH = apiHandler(async (e, user) => updateTicket(e.params.ticket!, await readJson(e), user.id), {
	responseSchema: ticketDtoSchema
});
export const DELETE = apiHandler((e) => deleteTicket(e.params.ticket!));
