import { apiHandler } from '$lib/server/api';
import { closeTicket } from '$lib/server/services/tickets';

export const POST = apiHandler((e) => closeTicket(e.params.ticket!));
