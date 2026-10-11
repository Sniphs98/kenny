import { ticketDtoSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { reopenTicket } from '#lib/server/services/tickets.js';

export const POST = apiHandler((e) => reopenTicket(e.params.ticket!), { responseSchema: ticketDtoSchema });
