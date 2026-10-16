import { commentSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { addComment, listComments } from '#lib/server/services/tickets.js';
import { z } from 'zod';

export const GET = apiHandler((e, user) => listComments(e.params.ticket!, user.id), {
	responseSchema: z.array(commentSchema)
});
export const POST = apiHandler(async (e, user) => addComment(e.params.ticket!, await readJson(e), user.id), {
	status: 201,
	responseSchema: commentSchema
});
