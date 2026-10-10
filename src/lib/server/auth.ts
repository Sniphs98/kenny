import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { db, schema } from './db';
import { APIError } from 'better-auth/api';
import { requireActiveUser } from './services/access';
import { bootstrapAdministrator } from './services/users';
import { teamsEnabled } from './teams';

// Microsoft-Login wird nur aktiviert, wenn die Zugangsdaten gesetzt sind (siehe README)
const socialProviders: BetterAuthOptions['socialProviders'] = {};
if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
	socialProviders.microsoft = {
		clientId: env.MICROSOFT_CLIENT_ID,
		clientSecret: env.MICROSOFT_CLIENT_SECRET,
		tenantId: env.MICROSOFT_TENANT_ID || 'common',
		// Nur für nationale Clouds (z.B. https://login.microsoftonline.us); sonst Microsofts Standard
		...(env.MICROSOFT_AUTHORITY ? { authority: env.MICROSOFT_AUTHORITY } : {}),
		// Teams-SSO-Tokens enthalten ohne optionalen Claim keine E-Mail; dann gilt der Anmeldename.
		// Er gilt nicht als bestätigt, verknüpft also keine bestehenden Konten über die E-Mail.
		mapProfileToUser: (profile) => (profile.email ? {} : { email: profile.preferred_username || profile.upn })
	};
}

export const microsoftEnabled = !!socialProviders.microsoft;

export const auth = betterAuth({
	baseURL: building ? 'http://localhost:3000' : env.BETTER_AUTH_URL,
	// Build analysis needs an auth instance, but must never need a production secret.
	secret: building ? 'build-only-placeholder-never-used-at-runtime-0123456789' : env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite', schema }),
	emailAndPassword: { enabled: true },
	user: {
		additionalFields: {
			role: { type: 'string', required: false, defaultValue: 'user', input: false },
			active: { type: 'boolean', required: false, defaultValue: true, input: false }
		}
	},
	databaseHooks: {
		user: {
			create: {
				after: async () => {
					bootstrapAdministrator();
				}
			}
		},
		session: {
			create: {
				before: async (created) => {
					try {
						requireActiveUser(created.userId);
					} catch {
						throw new APIError('FORBIDDEN', { message: 'Konto gesperrt oder nicht verfügbar.' });
					}
				}
			}
		}
	},
	socialProviders,
	// Teams zeigt Kenny in einem iframe einer fremden Seite: Cookies müssen dort mitgesendet werden.
	// Partitioned trennt die Teams-Sitzung von der normalen Browser-Sitzung; CSRF prüft SvelteKit (Origin).
	advanced: teamsEnabled()
		? { defaultCookieAttributes: { sameSite: 'none', secure: true, partitioned: true } }
		: undefined,
	plugins: [sveltekitCookies(getRequestEvent)]
});

export type Session = typeof auth.$Infer.Session;
