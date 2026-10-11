import { ticketDtoSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { closeTicket } from '#lib/server/services/tickets.js';

export const POST = apiHandler((e) => closeTicket(e.params.ticket!), { responseSchema: ticketDtoSchema });
