import { userProjectSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { assignUserProject, listUserProjects } from '#lib/server/services/users.js';
export const GET = apiHandler((e, actor) => listUserProjects(actor.id, e.params.user!), {
	responseSchema: userProjectSchema.array()
});
export const POST = apiHandler(async (e, actor) => assignUserProject(actor.id, e.params.user!, await readJson(e)), {
	status: 201,
	responseSchema: userProjectSchema
});
