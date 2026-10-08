import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login', '/api/'];

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		event.locals.user = session.user;
		event.locals.session = session.session;
	}

	const path = event.url.pathname;
	if (!event.locals.user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
		redirect(303, `/login?redirect=${encodeURIComponent(path + event.url.search)}`);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
