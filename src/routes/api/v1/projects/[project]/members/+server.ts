import { memberSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { getProject } from '#lib/server/services/projects.js';
import { addMember, listMembers } from '#lib/server/services/users.js';
export const GET = apiHandler((e, user) => listMembers(user.id, getProject(e.params.project!).id), {
	responseSchema: memberSchema.array()
});
export const POST = apiHandler(
	async (e, user) => addMember(user.id, getProject(e.params.project!).id, await readJson(e)),
	{ status: 201, responseSchema: memberSchema }
);
