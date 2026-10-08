import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db, schema } from './db';

// Microsoft-Login wird nur aktiviert, wenn die Zugangsdaten gesetzt sind (siehe README)
const socialProviders: BetterAuthOptions['socialProviders'] = {};
if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
	socialProviders.microsoft = {
		clientId: env.MICROSOFT_CLIENT_ID,
		clientSecret: env.MICROSOFT_CLIENT_SECRET,
		tenantId: env.MICROSOFT_TENANT_ID || 'common'
	};
}

export const microsoftEnabled = !!socialProviders.microsoft;

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite', schema }),
	emailAndPassword: { enabled: true },
	socialProviders,
	plugins: [sveltekitCookies(getRequestEvent)]
});

export type Session = typeof auth.$Infer.Session;
