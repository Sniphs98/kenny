import { apiHandler } from '#lib/server/api.js';
import { deleteComment } from '#lib/server/services/tickets.js';

export const DELETE = apiHandler((e, user) => deleteComment(e.params.ticket!, Number(e.params.comment), user.id));
