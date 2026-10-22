import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/env';
import { auth } from '#lib/server/auth.js';
import { LIVE_ORIGIN_HEADER, liveOrigin } from '#lib/server/live.js';
import { requireActiveUser } from '#lib/server/services/access.js';
import { ApiError } from '#lib/server/errors.js';
import { protectFraming } from '#lib/server/framing.js';
import { TEAMS_FRAME_ANCESTORS, teamsEnabled } from '#lib/server/teams.js';
import '#lib/locale-choice.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

// /submit/: Formulare zum Einreichen; ob eine Anmeldung nötig ist, entscheidet das Formular selbst
const PUBLIC_PATHS = ['/login', '/api/', '/submit/', '/status/'];
// Einstiegsseiten der Teams-App: melden selbst per Teams-SSO an
const PUBLIC_PAGES = ['/teams', '/teams/config', '/status'];

const handleAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		try {
			event.locals.user = { ...session.user, ...requireActiveUser(session.user.id) };
			event.locals.session = session.session;
		} catch (e) {
			if (!(e instanceof ApiError)) throw e;
		}
	}

	const path = event.url.pathname;
	if (!event.locals.user && !PUBLIC_PAGES.includes(path) && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
		redirect(303, `/login?redirect=${encodeURIComponent(path + event.url.search)}`);
	}

	const response = await svelteKitHandler({ event, resolve, auth, building });
	protectFraming(path, response.headers, teamsEnabled() ? TEAMS_FRAME_ANCESTORS : []);
	return response;
};

export const handle: Handle = (
	{ event, resolve }
	// Tab-Kennung für Live-Updates: Meldungen über eigene Änderungen ignoriert der Tab
) =>
	liveOrigin.run(event.request.headers.get(LIVE_ORIGIN_HEADER)?.slice(0, 64) || undefined, () =>
		paraglideMiddleware(event.request, ({ locale }) =>
			handleAuth({
				event,
				resolve: (event, options) =>
					resolve(event, {
						...options,
						transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
					})
			})
		)
	);
