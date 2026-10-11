import { localizeError } from '#lib/i18n.js';
import { error } from '@sveltejs/kit';
import { ApiError } from '#lib/server/errors.js';
import { listManagedUsers } from '#lib/server/services/users.js';
export const load = ({ locals }) => {
	try {
		return { users: listManagedUsers(locals.user!.id) };
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
