import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from './db';
import { apiToken, user } from './db/schema';
import { requireActiveUser } from './services/access';
import { ApiError } from './errors';
import { createApiTokenSchema } from '#lib/contracts/index.js';
import { parseInput } from './validation';

const TOKEN_PREFIX = 'kny_';

export function hashToken(token: string) {
	return createHash('sha256').update(token).digest('hex');
}

export async function createApiToken(
	userId: string,
	name: string,
	options: { readOnly?: boolean; lifetimeDays?: number } = {}
) {
	requireActiveUser(userId);
	const input = parseInput(createApiTokenSchema, { name, ...options });
	const token = TOKEN_PREFIX + randomBytes(24).toString('base64url');
	const [row] = await db
		.insert(apiToken)
		.values({
			userId,
			name: input.name,
			tokenHash: hashToken(token),
			prefix: token.slice(0, 10),
			readOnly: input.readOnly,
			expiresAt: new Date(Date.now() + input.lifetimeDays * 86400000)
		})
		.returning();
	return { token, row };
}

/**
 * Ermittelt den Benutzer einer API-Anfrage: entweder über die Browser-Session
 * oder über einen Header "Authorization: Bearer kny_...".
 */
export async function requireApiUser(event: Pick<RequestEvent, 'locals' | 'request' | 'route'>) {
	const header = event.request.headers.get('authorization') ?? '';
	// An explicit token must not inherit broader privileges from a browser session.
	if (!header && event.locals.user) return requireActiveUser(event.locals.user.id);
	const match = header.match(/^Bearer\s+(\S+)$/i);
	if (!match) throw new ApiError(401, 'Nicht angemeldet. Bitte API-Token als Bearer-Token senden.');

	const row = await db.query.apiToken.findFirst({
		where: eq(apiToken.tokenHash, hashToken(match[1]))
	});
	if (!row) throw new ApiError(401, 'Ungültiges API-Token.');
	if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw new ApiError(401, 'API-Token abgelaufen.');
	if (row.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && event.route.id !== '/api/v1/mcp')
		throw new ApiError(403, 'Dieses API-Token erlaubt nur Lesezugriff.');

	await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, row.id));
	const u = await db.query.user.findFirst({ where: eq(user.id, row.userId) });
	if (!u) throw new ApiError(401, 'Benutzer zum Token existiert nicht mehr.');
	return requireActiveUser(u.id);
}
