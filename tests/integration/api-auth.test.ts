import { beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { apiToken, project, user } from '#lib/server/db/schema.js';
import { createApiToken, requireApiUser } from '#lib/server/api-auth.js';

beforeEach(() => {
	db.delete(project).run();
	db.delete(user).run();
	db.insert(user).values({ id: 'token-owner', name: 'Owner', email: 'token@example.com', role: 'admin' }).run();
});

function event(
	token: string,
	method = 'GET',
	route: Parameters<typeof requireApiUser>[0]['route']['id'] = '/api/v1/projects'
) {
	return {
		locals: {},
		request: new Request('http://localhost/api/v1/projects', { method, headers: { authorization: `Bearer ${token}` } }),
		route: { id: route }
	};
}

it('enforces token lifetime, revocation and current account status', async () => {
	const { token, row } = await createApiToken('token-owner', '  Integration  ', { lifetimeDays: 30 });
	expect(row.name).toBe('Integration');
	expect(row.expiresAt!.getTime() - Date.now()).toBeGreaterThan(29 * 86400000);
	expect((await requireApiUser(event(token))).id).toBe('token-owner');
	db.update(apiToken)
		.set({ expiresAt: new Date(Date.now() - 1) })
		.where(eq(apiToken.id, row.id))
		.run();
	await expect(requireApiUser(event(token))).rejects.toMatchObject({ status: 401 });
	db.update(apiToken).set({ expiresAt: null }).where(eq(apiToken.id, row.id)).run();
	expect((await requireApiUser(event(token))).id).toBe('token-owner');
	db.update(user).set({ active: false }).where(eq(user.id, 'token-owner')).run();
	await expect(requireApiUser(event(token))).rejects.toMatchObject({ status: 401 });
	db.delete(apiToken).run();
	await expect(requireApiUser(event(token))).rejects.toMatchObject({ status: 401 });
});

it('read-only tokens cannot inherit write privileges from an administrator session and can use read-only MCP', async () => {
	const { token } = await createApiToken('token-owner', 'Read only', { readOnly: true });
	const owner = db.select().from(user).where(eq(user.id, 'token-owner')).get()!;
	await expect(requireApiUser({ ...event(token, 'POST'), locals: { user: owner } })).rejects.toMatchObject({
		status: 403
	});
	for (const method of ['PATCH', 'DELETE'])
		await expect(requireApiUser(event(token, method))).rejects.toMatchObject({ status: 403 });
	expect((await requireApiUser(event(token, 'POST', '/api/v1/mcp'))).id).toBe(owner.id);
	await expect(requireApiUser(event('invalid'))).rejects.toMatchObject({ status: 401 });
	expect(
		(await requireApiUser({ ...event(token), request: new Request('http://localhost'), locals: { user: owner } })).id
	).toBe(owner.id);
	await expect(createApiToken(owner.id, 'Too long', { lifetimeDays: 366 })).rejects.toMatchObject({ status: 400 });
});
