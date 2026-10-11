import { ticketSearchResultSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { searchTickets } from '#lib/server/services/tickets.js';

/** Tickets aller sichtbaren Projekte suchen: ?q=Begriff&limit=8 (Befehlspalette) */
export const GET = apiHandler(
	(e, user) => {
		const q = e.url.searchParams.get('q') ?? undefined;
		const limit = e.url.searchParams.get('limit');
		return searchTickets(user.id, { query: q, ...(limit ? { limit: Number(limit) } : {}) });
	},
	{ responseSchema: ticketSearchResultSchema }
);
