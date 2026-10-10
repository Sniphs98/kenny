import { managedUserSchema } from '$lib/contracts';
import { apiHandler } from '$lib/server/api';
import { listManagedUsers } from '$lib/server/services/users';
export const GET = apiHandler((_e, user) => listManagedUsers(user.id), { responseSchema: managedUserSchema.array() });
