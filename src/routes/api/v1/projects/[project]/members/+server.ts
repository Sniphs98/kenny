import { memberSchema } from '$lib/contracts';
import { apiHandler, readJson } from '$lib/server/api';
import { getProject } from '$lib/server/services/projects';
import { addMember, listMembers } from '$lib/server/services/users';
export const GET = apiHandler((e, user) => listMembers(user.id, getProject(e.params.project!).id), {
	responseSchema: memberSchema.array()
});
export const POST = apiHandler(
	async (e, user) => addMember(user.id, getProject(e.params.project!).id, await readJson(e)),
	{ status: 201, responseSchema: memberSchema }
);
