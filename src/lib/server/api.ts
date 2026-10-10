import { localizeError } from '$lib/i18n';
import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import type { ZodType } from 'zod';
import { ApiError } from './errors';
import { authorizeResource } from './services/access';
import { requireApiUser } from './api-auth';

type ApiUser = Awaited<ReturnType<typeof requireApiUser>>;

/** Wrapper für API-Routen: Authentifizierung, JSON-Antwort und einheitliche Fehler */
export function apiHandler(
	fn: (event: RequestEvent, user: ApiUser) => unknown,
	opts: { status?: number; responseSchema?: ZodType } = {}
): RequestHandler {
	return async (event) => {
		try {
			const user = await requireApiUser(event);
			const route = event.route.id ?? '';
			const settingsResource =
				route === '/api/v1/projects/[project]' || /\/(columns|tags|members|notifications)(\/|$)/.test(route);
			authorizeResource(user.id, event.request.method, event.params, settingsResource);
			const result = await fn(event, user);
			if (result instanceof Response) return result;
			const body = opts.responseSchema ? opts.responseSchema.parse(result) : result;
			return json(body ?? { ok: true }, { status: opts.status ?? 200 });
		} catch (e) {
			if (e instanceof ApiError) return json({ error: localizeError(e.message) }, { status: e.status });
			console.error(e);
			return json({ error: localizeError('Interner Fehler') }, { status: 500 });
		}
	};
}

export async function readJson(event: RequestEvent): Promise<Record<string, unknown>> {
	try {
		const body = await event.request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) return body;
	} catch {
		// fällt unten durch
	}
	throw new ApiError(400, 'Request-Body muss ein JSON-Objekt sein.');
}
