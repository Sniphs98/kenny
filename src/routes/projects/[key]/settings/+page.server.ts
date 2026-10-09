import { localizeError } from '$lib/i18n';
import { error } from '@sveltejs/kit';
export const load = async ({ parent }) => {
	const data = await parent();
	if (!data.canManage) error(403, localizeError('Unzureichende Projektberechtigungen.'));
};
