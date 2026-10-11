import { projectSchema, projectDetailSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { deleteProject, getColumns, getProject, updateProject } from '#lib/server/services/projects.js';

export const GET = apiHandler(
	(e) => {
		const p = getProject(e.params.project!);
		return { ...p, columns: getColumns(p.id) };
	},
	{ responseSchema: projectDetailSchema }
);
export const PATCH = apiHandler(async (e) => updateProject(getProject(e.params.project!).id, await readJson(e)), {
	responseSchema: projectSchema
});
export const DELETE = apiHandler((e) => deleteProject(getProject(e.params.project!).id));
