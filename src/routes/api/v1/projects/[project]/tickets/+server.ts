import { apiHandler, readJson } from '$lib/server/api';
import { getProject } from '$lib/server/services/projects';
import { createTicket, listTickets } from '$lib/server/services/tickets';

/** GET ?closed=true|false filtert nach Status */
export const GET = apiHandler((e) => {
	const closed = e.url.searchParams.get('closed');
	return listTickets(getProject(e.params.project!).id, {
		closed: closed === null ? undefined : closed === 'true'
	});
});
export const POST = apiHandler(
	async (e, user) => createTicket(e.params.project!, await readJson(e), user.id),
	{ status: 201 }
);
