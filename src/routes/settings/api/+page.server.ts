import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { apiToken } from '$lib/server/db/schema';
import { createApiToken } from '$lib/server/api-auth';

export const load = ({ locals }) => ({
	tokens: db
		.select({
			id: apiToken.id,
			name: apiToken.name,
			prefix: apiToken.prefix,
			createdAt: apiToken.createdAt,
			lastUsedAt: apiToken.lastUsedAt
		})
		.from(apiToken)
		.where(eq(apiToken.userId, locals.user!.id))
		.orderBy(desc(apiToken.createdAt))
		.all()
});

export const actions = {
	create: async ({ request, locals }) => {
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Bitte einen Namen angeben.' });
		const { token } = await createApiToken(locals.user!.id, name);
		return { token };
	},
	delete: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		db.delete(apiToken)
			.where(and(eq(apiToken.id, id), eq(apiToken.userId, locals.user!.id)))
			.run();
	}
};
