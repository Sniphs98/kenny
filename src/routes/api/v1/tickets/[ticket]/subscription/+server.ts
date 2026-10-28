import { ticketSubscriptionSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { subscribeToTicket, unsubscribeFromTicket } from '#lib/server/services/tickets.js';

export const PUT = apiHandler((e, user) => subscribeToTicket(e.params.ticket!, user.id), {
	responseSchema: ticketSubscriptionSchema
});
export const DELETE = apiHandler((e, user) => unsubscribeFromTicket(e.params.ticket!, user.id), {
	responseSchema: ticketSubscriptionSchema
});
