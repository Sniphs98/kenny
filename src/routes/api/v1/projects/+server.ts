import { apiHandler, readJson } from '$lib/server/api';
import { createProject, listProjects } from '$lib/server/services/projects';

export const GET = apiHandler(() => listProjects());
export const POST = apiHandler(async (e, user) => createProject(await readJson(e), user.id), { status: 201 });
