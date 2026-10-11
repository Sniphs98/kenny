import { apiHandler, readJson } from '#lib/server/api.js';
import { addLink } from '#lib/server/services/tickets.js';

/** Body: { "target": "WEB-3", "type": "depends_on" | "blocks" | "relates" } */
export const POST = apiHandler(async (e, user) => addLink(e.params.ticket!, await readJson(e), user.id), {
	status: 201
});
