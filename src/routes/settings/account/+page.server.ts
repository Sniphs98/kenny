import { getAccountConnections } from '#lib/server/services/account-connections.js';

export const load = ({ locals }) => ({ connections: getAccountConnections(locals.user!.id) });
