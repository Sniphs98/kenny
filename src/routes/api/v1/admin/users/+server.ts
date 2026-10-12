import { managedUserSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { listManagedUsers } from '#lib/server/services/users.js';
export const GET = apiHandler((_e, user) => listManagedUsers(user.id), { responseSchema: managedUserSchema.array() });
