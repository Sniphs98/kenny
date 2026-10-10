import { localizeError } from '$lib/i18n';
import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { requireAdmin } from '$lib/server/services/access';
import { teamsConfig, teamsEnabled, teamsPackage } from '$lib/server/teams';

/** Teams-App-Paket (manifest.json und Icons) zum Hochladen in Teams oder im Teams Admin Center */
export const GET = ({ locals }) => {
	try {
		requireAdmin(locals.user!.id);
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
	if (!teamsEnabled()) error(409, localizeError('Microsoft Teams ist nicht aktiviert.'));
	return new Response(teamsPackage(teamsConfig()), {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': 'attachment; filename="kenny-teams.zip"',
			'cache-control': 'no-store'
		}
	});
};
