import { apiHandler, readJson } from '$lib/server/api';
import { getProject } from '$lib/server/services/projects';
import { createTag, listTags } from '$lib/server/services/tags';

export const GET = apiHandler((e) => listTags(getProject(e.params.project!).id));
export const POST = apiHandler(async (e) => createTag(e.params.project!, await readJson(e)), { status: 201 });
