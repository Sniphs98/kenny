import { projectSchema, projectListItemSchema } from '$lib/contracts';
import { apiHandler, readJson } from '$lib/server/api';
import { createProject, listProjects } from '$lib/server/services/projects';

export const GET = apiHandler((_e, user) => listProjects(user.id), { responseSchema: projectListItemSchema.array() });
export const POST = apiHandler(async (e, user) => createProject(await readJson(e), user.id), {
	status: 201,
	responseSchema: projectSchema
});
