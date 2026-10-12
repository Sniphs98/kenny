import { apiHandler } from '#lib/server/api.js';
import { removeLink } from '#lib/server/services/tickets.js';

export const DELETE = apiHandler((e) => removeLink(e.params.ticket!, Number(e.params.link)));
