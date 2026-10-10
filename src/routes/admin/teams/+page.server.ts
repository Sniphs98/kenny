import { localizeError } from '$lib/i18n';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { ApiError } from '$lib/server/errors';
import { requireAdmin } from '$lib/server/services/access';
import { TEAMS_CLIENT_IDS, applicationIdUri, microsoftConfigured, teamsConfig, teamsEnabled } from '$lib/server/teams';

/** Einrichtung von Microsoft Teams: Status und alle Werte, die in Entra ID einzutragen sind */
export const load = ({ locals }) => {
	try {
		requireAdmin(locals.user!.id);
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
	const config = teamsConfig();
	let validUrl = true;
	try {
		new URL(config.baseUrl);
	} catch {
		validUrl = false;
	}
	return {
		status: {
			microsoft: microsoftConfigured(),
			enabled: teamsEnabled(),
			https: validUrl && config.baseUrl.startsWith('https://')
		},
		baseUrl: config.baseUrl,
		clientId: config.clientId,
		tenantId: env.MICROSOFT_TENANT_ID || 'common',
		applicationIdUri: validUrl && config.clientId ? applicationIdUri(config) : '',
		redirectUri: `${config.baseUrl}/api/auth/callback/microsoft`,
		teamsClients: Object.entries(TEAMS_CLIENT_IDS).map(([name, id]) => ({ name, id })),
		appId: config.appId,
		version: config.version
	};
};
