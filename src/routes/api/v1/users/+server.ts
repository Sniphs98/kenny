import { userSchema } from '$lib/contracts';
import { apiHandler } from '$lib/server/api';
import { visibleUsers } from '$lib/server/services/access';

export const GET = apiHandler((_e, user) => visibleUsers(user.id), { responseSchema: userSchema.array() });
