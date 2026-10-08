import { apiHandler, readJson } from '$lib/server/api';
import { addColumn, getColumns, getProject } from '$lib/server/services/projects';

export const GET = apiHandler((e) => getColumns(getProject(e.params.project!).id));
export const POST = apiHandler(
	async (e) => addColumn(getProject(e.params.project!).id, await readJson(e)),
	{ status: 201 }
);
