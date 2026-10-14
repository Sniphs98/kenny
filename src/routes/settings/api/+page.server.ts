import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { apiToken } from '#lib/server/db/schema.js';
import { createApiToken } from '#lib/server/api-auth.js';
import { ApiError } from '#lib/server/errors.js';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { createApiTokenSchema } from '#lib/contracts/index.js';

export const load = ({ locals }) => ({
	tokens: db
		.select({
			id: apiToken.id,
			name: apiToken.name,
			prefix: apiToken.prefix,
			createdAt: apiToken.createdAt,
			lastUsedAt: apiToken.lastUsedAt,
			readOnly: apiToken.readOnly,
			expiresAt: apiToken.expiresAt
		})
		.from(apiToken)
		.where(eq(apiToken.userId, locals.user!.id))
		.orderBy(desc(apiToken.createdAt))
		.all()
});

export const actions = {
	create: async ({ request, locals }) => {
		const tokenForm = await superValidate(request, zod4(createApiTokenSchema));
		if (!tokenForm.valid) return fail(400, { tokenForm, error: 'Ungültige Token-Einstellungen.' });
		try {
			const { token } = await createApiToken(locals.user!.id, tokenForm.data.name, tokenForm.data);
			return { token };
		} catch (e) {
			if (e instanceof ApiError) return fail(e.status, { error: e.message });
			throw e;
		}
	},
	delete: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		db.delete(apiToken)
			.where(and(eq(apiToken.id, id), eq(apiToken.userId, locals.user!.id)))
			.run();
	}
};
