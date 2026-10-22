import { defineEnvVars } from '@sveltejs/kit/env';

// Optional settings keep their existing application defaults when absent.
export const variables = defineEnvVars({
	MICROSOFT_TENANT_ID: { schema: (input) => input ?? '' },
	MICROSOFT_CLIENT_ID: { schema: (input) => input ?? '' },
	MICROSOFT_CLIENT_SECRET: { schema: (input) => input ?? '' },
	MICROSOFT_AUTHORITY: { schema: (input) => input ?? '' },
	BETTER_AUTH_URL: { schema: (input) => input ?? '' },
	BETTER_AUTH_SECRET: { schema: (input) => input ?? '' },
	TEAMS_ENABLED: { schema: (input) => input ?? '' },
	TEAMS_APP_ID: { schema: (input) => input ?? '' },
	TEAMS_APP_VERSION: { schema: (input) => input ?? '' },
	TEAMS_DEVELOPER_NAME: { schema: (input) => input ?? '' },
	ATTACHMENTS_DIR: { schema: (input) => input ?? '' },
	ATTACHMENT_MAX_MB: { schema: (input) => input ?? '' },
	SMTP_HOST: { schema: (input) => input ?? '' },
	SMTP_PORT: { schema: (input) => input ?? '' },
	SMTP_SECURE: { schema: (input) => input ?? '' },
	SMTP_USER: { schema: (input) => input ?? '' },
	SMTP_PASSWORD: { schema: (input) => input ?? '' },
	SMTP_FROM: { schema: (input) => input ?? '' },
	DATABASE_URL: { schema: (input) => input ?? '' },
	MIGRATIONS_DIR: { schema: (input) => input ?? '' }
});
