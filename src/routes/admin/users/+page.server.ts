import { localizeError } from '#lib/i18n.js';
import { error, fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { createUserSchema } from '#lib/contracts/index.js';
import { ApiError } from '#lib/server/errors.js';
import { createManagedUser, listManagedUsers } from '#lib/server/services/users.js';
import { requireAdmin } from '#lib/server/services/access.js';
export const load = async ({ locals }) => {
	try {
		return { users: listManagedUsers(locals.user!.id), form: await superValidate(zod4(createUserSchema)) };
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};

export const actions = {
	default: async ({ locals, request }) => {
		// Check before reading credentials and again inside the atomic write.
		try {
			requireAdmin(locals.user!.id);
		} catch (e) {
			if (e instanceof ApiError) error(e.status, localizeError(e.message));
			throw e;
		}
		const form = await superValidate(request, zod4(createUserSchema));
		if (!form.valid) {
			form.data.password = '';
			return fail(400, { form });
		}
		try {
			await createManagedUser(locals.user!.id, form.data);
		} catch (e) {
			form.data.password = '';
			if (e instanceof ApiError) return fail(e.status, { form: { ...form, message: localizeError(e.message) } });
			throw e;
		}
		return { form: { ...(await superValidate(zod4(createUserSchema))), message: 'created' } };
	}
};
