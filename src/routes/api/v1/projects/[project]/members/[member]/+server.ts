import { apiHandler, readJson } from '$lib/server/api';
import { getProject } from '$lib/server/services/projects';
import { changeMember } from '$lib/server/services/users';
export const PATCH = apiHandler(async (e, user) =>
	changeMember(user.id, getProject(e.params.project!).id, e.params.member!, await readJson(e))
);
export const DELETE = apiHandler((e, user) =>
	changeMember(user.id, getProject(e.params.project!).id, e.params.member!, null)
);
