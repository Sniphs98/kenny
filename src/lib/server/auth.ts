import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { building } from '$app/env';

import {
	MICROSOFT_CLIENT_ID,
	MICROSOFT_CLIENT_SECRET,
	MICROSOFT_TENANT_ID,
	MICROSOFT_AUTHORITY,
	BETTER_AUTH_URL,
	BETTER_AUTH_SECRET
} from '$app/env/private';

import { db, schema } from './db';
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { requireActiveUser } from './services/access';
import { bootstrapAdministrator, registrationAllowed } from './services/users';
import { teamsEnabled } from './teams';
import { withBase } from '#lib/paths.js';
import {
	assertMicrosoftAccountCanBeAdded,
	assertMicrosoftLinkIdentity,
	microsoftLinkingConfigured
} from './services/account-connections.js';

// Microsoft-Login wird nur aktiviert, wenn die Zugangsdaten gesetzt sind (siehe README)
const socialProviders: BetterAuthOptions['socialProviders'] = {};
if (MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET) {
	socialProviders.microsoft = {
		clientId: MICROSOFT_CLIENT_ID,
		clientSecret: MICROSOFT_CLIENT_SECRET,
		tenantId: MICROSOFT_TENANT_ID || 'common',
		// Nur für nationale Clouds (z.B. https://login.microsoftonline.us); sonst Microsofts Standard
		...(MICROSOFT_AUTHORITY ? { authority: MICROSOFT_AUTHORITY } : {}),
		// Teams-SSO-Tokens enthalten ohne optionalen Claim keine E-Mail; dann gilt der Anmeldename.
		// Er gilt nicht als bestätigt, verknüpft also keine bestehenden Konten über die E-Mail.
		mapProfileToUser: (profile) => (profile.email ? {} : { email: profile.preferred_username || profile.upn })
	};
}

export const microsoftEnabled = !!socialProviders.microsoft;

export const auth = betterAuth({
	baseURL: building ? 'http://localhost:3000' : BETTER_AUTH_URL || undefined,
	// BETTER_AUTH_URL ist nur die Origin; ein Unterpfad hinter einem Reverse Proxy gehört hierher
	basePath: withBase('/api/auth'),
	// Build analysis needs an auth instance, but must never need a production secret.
	secret: building ? 'build-only-placeholder-never-used-at-runtime-0123456789' : BETTER_AUTH_SECRET || undefined,
	database: drizzleAdapter(db, { provider: 'sqlite', schema }),
	emailAndPassword: { enabled: true },
	user: {
		validateUserInfo: async ({ user, source }, context) => {
			if (source.action !== 'link-account' || source.method !== 'oauth' || source.oauth?.providerId !== 'microsoft')
				return;
			const session = await getAuthoritativeSessionFromCtx(context);
			try {
				assertMicrosoftLinkIdentity(user.id!, session?.user.id, source.oauth.profile, MICROSOFT_TENANT_ID);
			} catch {
				return { error: 'microsoft_link_rejected' };
			}
		},
		additionalFields: {
			role: { type: 'string', required: false, defaultValue: 'user', input: false },
			active: { type: 'boolean', required: false, defaultValue: true, input: false }
		}
	},
	hooks: {
		before: createAuthMiddleware(async (context) => {
			if (context.path !== '/link-social' || context.body?.provider !== 'microsoft') return;
			const session = await getAuthoritativeSessionFromCtx(context);
			if (!session)
				throw new APIError('UNAUTHORIZED', { code: 'UNAUTHORIZED', message: 'Konto gesperrt oder nicht verfügbar.' });
			try {
				if (!microsoftLinkingConfigured()) throw new Error('Microsoft linking is not configured');
				assertMicrosoftAccountCanBeAdded(session.user.id);
			} catch {
				throw new APIError('FORBIDDEN', {
					code: 'MICROSOFT_LINK_UNAVAILABLE',
					message: 'Das Microsoft-Konto konnte nicht verbunden werden.'
				});
			}
		})
	},
	databaseHooks: {
		account: {
			create: {
				before: async (created) => {
					if (created.providerId !== 'microsoft') return;
					try {
						assertMicrosoftAccountCanBeAdded(created.userId);
					} catch {
						throw new APIError('FORBIDDEN', { message: 'Das Microsoft-Konto konnte nicht verbunden werden.' });
					}
				}
			}
		},
		user: {
			create: {
				before: async () => {
					if (!registrationAllowed())
						throw new APIError('FORBIDDEN', { message: 'Neue Konten werden durch Administratoren angelegt.' });
				},
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
	// Linking is explicit: a matching email never attaches a Microsoft identity to a local user.
	account: {
		accountLinking: {
			enabled: microsoftLinkingConfigured(),
			disableImplicitLinking: true,
			trustedProviders: microsoftLinkingConfigured() ? ['microsoft'] : [],
			allowDifferentEmails: true,
			updateUserInfoOnLink: false
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
