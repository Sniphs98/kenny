import { projectSchema, projectListItemSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { createProject, listProjects } from '#lib/server/services/projects.js';

export const GET = apiHandler((_e, user) => listProjects(user.id), { responseSchema: projectListItemSchema.array() });
export const POST = apiHandler(async (e, user) => createProject(await readJson(e), user.id), {
	status: 201,
	responseSchema: projectSchema
});
