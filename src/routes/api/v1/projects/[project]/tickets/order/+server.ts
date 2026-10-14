import { ticketOrderSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { reorderTickets } from '#lib/server/services/tickets.js';

/** Manuelle Reihenfolge einer Spalte; Body: {"column": 3, "tickets": [12, 7, 9]} */
export const PUT = apiHandler(async (e) => reorderTickets(e.params.project!, await readJson(e)), {
	responseSchema: ticketOrderSchema
});
