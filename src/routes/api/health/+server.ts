import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';

export const GET = () => {
	try {
		db.get(sql`select 1 from project limit 1`);
		return json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return json({ status: 'unavailable' }, { status: 503 });
	}
};
