import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { ApiError } from './errors';
import { requireApiUser } from './api-auth';

type ApiUser = Awaited<ReturnType<typeof requireApiUser>>;

/** Wrapper für API-Routen: Authentifizierung, JSON-Antwort und einheitliche Fehler */
export function apiHandler(
	fn: (event: RequestEvent, user: ApiUser) => unknown,
	opts: { status?: number } = {}
): RequestHandler {
	return async (event) => {
		try {
			const user = await requireApiUser(event);
			const result = await fn(event, user);
			if (result instanceof Response) return result;
			return json(result ?? { ok: true }, { status: opts.status ?? 200 });
		} catch (e) {
			if (e instanceof ApiError) return json({ error: e.message }, { status: e.status });
			console.error(e);
			return json({ error: 'Interner Fehler' }, { status: 500 });
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
