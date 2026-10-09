import { localizeError } from '$lib/i18n';
import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { listMembers } from '$lib/server/services/users';
export const load = async ({ parent, locals }) => {
	const data = await parent();
	if (!data.canManage) error(403, localizeError('Unzureichende Projektberechtigungen.'));
	try {
		return { members: listMembers(locals.user!.id, data.project.id) };
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
