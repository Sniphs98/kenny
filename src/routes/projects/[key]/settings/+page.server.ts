import { localizeError } from '#lib/i18n.js';
import { error } from '@sveltejs/kit';
import { getNotifications } from '#lib/server/services/notifications.js';

export const load = async ({ parent, params, locals }) => {
	const data = await parent();
	if (!data.canManage) error(403, localizeError('Unzureichende Projektberechtigungen.'));
	return { notifications: getNotifications(params.key, locals.user!.id) };
};
