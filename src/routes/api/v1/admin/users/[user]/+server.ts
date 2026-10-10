import { managedUserSchema } from '$lib/contracts';
import { apiHandler, readJson } from '$lib/server/api';
import { updateUser } from '$lib/server/services/users';
export const PATCH = apiHandler(async (e, user) => updateUser(user.id, e.params.user!, await readJson(e)), {
	responseSchema: managedUserSchema
});
