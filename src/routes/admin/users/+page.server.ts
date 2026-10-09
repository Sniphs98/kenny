import { localizeError } from '$lib/i18n';
import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { listManagedUsers } from '$lib/server/services/users';
export const load = ({ locals }) => {
	try {
		return { users: listManagedUsers(locals.user!.id) };
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
