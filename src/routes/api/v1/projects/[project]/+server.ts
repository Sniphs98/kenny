import { apiHandler, readJson } from '$lib/server/api';
import { deleteProject, getColumns, getProject, updateProject } from '$lib/server/services/projects';

export const GET = apiHandler((e) => {
	const p = getProject(e.params.project!);
	return { ...p, columns: getColumns(p.id) };
});
export const PATCH = apiHandler(async (e) => updateProject(getProject(e.params.project!).id, await readJson(e)));
export const DELETE = apiHandler((e) => deleteProject(getProject(e.params.project!).id));
