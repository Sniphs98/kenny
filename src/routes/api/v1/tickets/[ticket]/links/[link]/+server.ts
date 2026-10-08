import { apiHandler } from '$lib/server/api';
import { removeLink } from '$lib/server/services/tickets';

export const DELETE = apiHandler((e) => removeLink(e.params.ticket!, Number(e.params.link)));
