import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } from '$app/env/private';
import { db } from '../db/index.js';
import { account } from '../db/schema.js';
import { ApiError } from '../errors.js';
import { parseInput } from '../validation.js';
import { requireActiveUser } from './access.js';

const config = {
	clientId: MICROSOFT_CLIENT_ID,
	clientSecret: MICROSOFT_CLIENT_SECRET,
	tenantId: MICROSOFT_TENANT_ID
};

function companyTenant(tenantId: string) {
	return z.guid().safeParse(tenantId).success && tenantId.toLowerCase() !== '9188040d-6c67-4c5b-b112-36a304b66dad';
}

export function microsoftLinkingConfigured(settings = config) {
	return !!(settings.clientId && settings.clientSecret && companyTenant(settings.tenantId));
}

export function getAccountConnections(userId: string, settings = config) {
	requireActiveUser(userId);
	return {
		microsoftEnabled: !!(settings.clientId && settings.clientSecret),
		microsoftLinkingEnabled: microsoftLinkingConfigured(settings),
		microsoftLinked: !!db
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, 'microsoft')))
			.get()
	};
}

const microsoftIdentitySchema = z.object({ tid: z.guid(), oid: z.guid() });

/** Called only after Better Auth has verified the OAuth signature, issuer, audience and nonce. */
export function assertMicrosoftLinkIdentity(
	userId: string,
	sessionUserId: string | undefined,
	profile: unknown,
	tenantId: string
) {
	requireActiveUser(userId);
	if (userId !== sessionUserId) throw new ApiError(403, 'Eine aktive Sitzung für dieses Konto ist erforderlich.');
	const identity = parseInput(microsoftIdentitySchema, profile);
	if (!companyTenant(tenantId) || identity.tid.toLowerCase() !== tenantId.toLowerCase())
		throw new ApiError(403, 'Das Microsoft-Konto muss zum konfigurierten Firmenmandanten gehören.');
}

export function assertMicrosoftAccountCanBeAdded(userId: string) {
	requireActiveUser(userId);
	if (getAccountConnections(userId).microsoftLinked)
		throw new ApiError(409, 'Ein Microsoft-Konto ist bereits verbunden.');
}
