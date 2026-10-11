import { userSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { visibleUsers } from '#lib/server/services/access.js';

export const GET = apiHandler((_e, user) => visibleUsers(user.id), { responseSchema: userSchema.array() });
