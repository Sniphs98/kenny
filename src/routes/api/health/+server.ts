import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';

export const GET = () => {
	try {
		db.get(sql`select 1 from project limit 1`);
		return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return Response.json({ status: 'unavailable' }, { status: 503 });
	}
};
