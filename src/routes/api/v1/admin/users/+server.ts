import { managedUserSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { createManagedUser, listManagedUsers } from '#lib/server/services/users.js';
export const GET = apiHandler((_e, user) => listManagedUsers(user.id), { responseSchema: managedUserSchema.array() });
export const POST = apiHandler(async (e, user) => createManagedUser(user.id, await readJson(e)), {
	status: 201,
	responseSchema: managedUserSchema
});
