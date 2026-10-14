import { error } from '@sveltejs/kit';
import { localizeError } from '#lib/i18n.js';
import { ApiError } from '#lib/server/errors.js';
import { getManagedUser, listUserProjects } from '#lib/server/services/users.js';
import { listProjects } from '#lib/server/services/projects.js';

export const load = ({ locals, params }) => {
	try {
		const user = getManagedUser(locals.user!.id, params.user);
		return {
			managedUser: user,
			memberships: listUserProjects(locals.user!.id, params.user),
			projects: listProjects(locals.user!.id).map(({ id, key, name }) => ({ id, key, name }))
		};
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
