import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest aliases only. Never read the developer's environment or database.
export const env = {
	DATABASE_URL: ':memory:',
	ATTACHMENTS_DIR: mkdtempSync(join(tmpdir(), 'kenny-vitest-attachments-')),
	MIGRATIONS_DIR: 'drizzle'
};
