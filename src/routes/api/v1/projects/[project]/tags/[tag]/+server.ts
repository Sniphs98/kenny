import { apiHandler, readJson } from '$lib/server/api';
import { deleteTag, updateTag } from '$lib/server/services/tags';

export const PATCH = apiHandler(async (e) => updateTag(e.params.project!, Number(e.params.tag), await readJson(e)));
export const DELETE = apiHandler((e) => deleteTag(e.params.project!, Number(e.params.tag)));
