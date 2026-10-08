import { apiHandler } from '$lib/server/api';
import { reopenTicket } from '$lib/server/services/tickets';

export const POST = apiHandler((e) => reopenTicket(e.params.ticket!));
