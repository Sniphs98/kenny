import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';
import * as schema from './schema';

const file = env.DATABASE_URL || 'data/kenny.db';
if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

const client = new Database(building ? ':memory:' : file);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

export const db = drizzle(client, { schema });

// Migrationen beim Start automatisch anwenden
if (!building) migrate(db, { migrationsFolder: env.MIGRATIONS_DIR || 'drizzle' });

export { schema };
