import { apiHandler } from '$lib/server/api';
import { listUsers } from '$lib/server/services/tickets';

export const GET = apiHandler(() => listUsers());
