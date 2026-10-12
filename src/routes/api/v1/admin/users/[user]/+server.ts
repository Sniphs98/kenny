import { managedUserSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { updateUser } from '#lib/server/services/users.js';
export const PATCH = apiHandler(async (e, user) => updateUser(user.id, e.params.user!, await readJson(e)), {
	responseSchema: managedUserSchema
});
