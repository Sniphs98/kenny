import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest aliases only. Never read the developer's environment or database.
export const DATABASE_URL = ':memory:';
export const ATTACHMENTS_DIR = mkdtempSync(join(tmpdir(), 'kenny-vitest-attachments-'));
export const MIGRATIONS_DIR = 'drizzle';
export const MICROSOFT_TENANT_ID = '';
export const MICROSOFT_CLIENT_ID = '';
export const MICROSOFT_CLIENT_SECRET = '';
export const MICROSOFT_AUTHORITY = '';
export const BETTER_AUTH_URL = '';
export const BETTER_AUTH_SECRET = '';
export const TEAMS_ENABLED = '';
export const TEAMS_APP_ID = '';
export const TEAMS_APP_VERSION = '';
export const TEAMS_DEVELOPER_NAME = '';
export const ATTACHMENT_MAX_MB = '';
export const env = {
	DATABASE_URL,
	ATTACHMENTS_DIR,
	MIGRATIONS_DIR
};
