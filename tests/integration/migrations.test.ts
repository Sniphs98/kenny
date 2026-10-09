import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';

it('upgrades populated databases from every earlier migration and can restart idempotently', () => {
	const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
		entries: { tag: string; when: number }[];
	};
	for (let count = 1; count <= journal.entries.length; count++) {
		const client = new Database(':memory:');
		try {
			client.pragma('foreign_keys = ON');
			client.exec(
				'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)'
			);
			for (const entry of journal.entries.slice(0, count)) {
				client.exec(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'));
				client.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run('fixture', entry.when);
			}
			client.exec("INSERT INTO project (key, name) VALUES ('KEEP', 'Existing project')");
			client.exec("INSERT INTO board_column (project_id, name) VALUES (1, 'Open')");
			client.exec("INSERT INTO ticket (project_id, number, title, column_id) VALUES (1, 1, 'Existing ticket', 1)");
			const db = drizzle(client);
			migrate(db, { migrationsFolder: 'drizzle' });
			migrate(db, { migrationsFolder: 'drizzle' });
			expect(client.prepare('SELECT title FROM ticket').get()).toEqual({ title: 'Existing ticket' });
			expect(client.prepare('SELECT is_backlog FROM board_column').get()).toEqual({ is_backlog: 0 });
			expect(client.prepare('SELECT * FROM attachment').all()).toEqual([]);
			// Formular löschen lässt eingereichte Tickets bestehen und leert nur die Herkunft
			client.exec("INSERT INTO intake_form (name, token) VALUES ('Support', 'token')");
			client.exec('UPDATE ticket SET intake_form_id = 1');
			client.exec('DELETE FROM intake_form');
			expect(client.prepare('SELECT title, intake_form_id FROM ticket').get()).toEqual({
				title: 'Existing ticket',
				intake_form_id: null
			});
			expect(client.pragma('foreign_key_check')).toEqual([]);
			expect(client.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual({
				n: journal.entries.length
			});
		} finally {
			client.close();
		}
	}
});
