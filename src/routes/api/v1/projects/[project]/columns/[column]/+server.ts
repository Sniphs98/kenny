import { apiHandler, readJson } from '$lib/server/api';
import { deleteColumn, getProject, updateColumn } from '$lib/server/services/projects';

export const PATCH = apiHandler(async (e) =>
	updateColumn(getProject(e.params.project!).id, Number(e.params.column), await readJson(e))
);
export const DELETE = apiHandler((e) => deleteColumn(getProject(e.params.project!).id, Number(e.params.column)));
