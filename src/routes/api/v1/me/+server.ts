import { apiHandler } from '#lib/server/api.js';

export const GET = apiHandler((_e, user) => ({ id: user.id, name: user.name, email: user.email }));
