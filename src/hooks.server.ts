import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { LIVE_ORIGIN_HEADER, liveOrigin } from '$lib/server/live';
import { requireActiveUser } from '$lib/server/services/access';
import { ApiError } from '$lib/server/errors';
import '$lib/locale-choice';
import { paraglideMiddleware } from '$lib/paraglide/server.js';

// /submit/: Formulare zum Einreichen; ob eine Anmeldung nötig ist, entscheidet das Formular selbst
const PUBLIC_PATHS = ['/login', '/api/', '/submit/'];

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
	if (!event.locals.user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
		redirect(303, `/login?redirect=${encodeURIComponent(path + event.url.search)}`);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = ({ event, resolve }) =>
	// Tab-Kennung für Live-Updates: Meldungen über eigene Änderungen ignoriert der Tab
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
