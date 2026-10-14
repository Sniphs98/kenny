import { apiHandler, readJson } from '#lib/server/api.js';
import { changeUserProject } from '#lib/server/services/users.js';
export const PATCH = apiHandler(async (e, actor) =>
	changeUserProject(actor.id, e.params.user!, e.params.project!, await readJson(e))
);
export const DELETE = apiHandler((e, actor) => changeUserProject(actor.id, e.params.user!, e.params.project!, null));
