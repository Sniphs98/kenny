import { beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { account, user } from '#lib/server/db/schema.js';
import {
	assertMicrosoftAccountCanBeAdded,
	assertMicrosoftLinkIdentity,
	getAccountConnections,
	microsoftLinkingConfigured
} from '#lib/server/services/account-connections.js';

const tenant = '11111111-1111-4111-8111-111111111111';
const identity = { tid: tenant, oid: 'aaaaaaaa-0000-4000-8000-000000000001' };
const configured = { clientId: 'client', clientSecret: 'secret', tenantId: tenant };

beforeEach(() => {
	db.delete(user).run();
	db.insert(user).values({ id: 'local', name: 'Local', email: 'local@example.com' }).run();
});

it('requires configured credentials and a fixed tenant for explicit linking', () => {
	expect(microsoftLinkingConfigured(configured)).toBe(true);
	for (const settings of [
		{ ...configured, clientId: '' },
		{ ...configured, clientSecret: '' },
		{ ...configured, tenantId: 'common' },
		{ ...configured, tenantId: 'organizations' },
		{ ...configured, tenantId: '9188040d-6c67-4c5b-b112-36a304b66dad' }
	])
		expect(microsoftLinkingConfigured(settings)).toBe(false);
});

it('returns only connection status and rejects inactive users', () => {
	expect(getAccountConnections('local', configured)).toEqual({
		microsoftEnabled: true,
		microsoftLinkingEnabled: true,
		microsoftLinked: false
	});
	db.insert(account)
		.values({
			id: 'ms',
			accountId: identity.oid,
			providerId: 'microsoft',
			userId: 'local',
			accessToken: 'private-token'
		})
		.run();
	expect(getAccountConnections('local', configured)).toEqual({
		microsoftEnabled: true,
		microsoftLinkingEnabled: true,
		microsoftLinked: true
	});
	expect(() => assertMicrosoftAccountCanBeAdded('local')).toThrow('bereits verbunden');
	db.update(user).set({ active: false }).where(eq(user.id, 'local')).run();
	expect(() => getAccountConnections('local', configured)).toThrow();
	expect(() => assertMicrosoftAccountCanBeAdded('local')).toThrow();
});

it('requires the initiating active session and a validated identity from the configured tenant', () => {
	expect(() => assertMicrosoftAccountCanBeAdded('local')).not.toThrow();
	expect(() => assertMicrosoftLinkIdentity('local', 'local', identity, tenant)).not.toThrow();
	for (const sessionId of [undefined, 'someone-else'])
		expect(() => assertMicrosoftLinkIdentity('local', sessionId, identity, tenant)).toThrow();
	for (const profile of [{ ...identity, tid: '22222222-2222-4222-8222-222222222222' }, { tid: tenant }, null])
		expect(() => assertMicrosoftLinkIdentity('local', 'local', profile, tenant)).toThrow();
	expect(() => assertMicrosoftLinkIdentity('local', 'local', identity, 'common')).toThrow();
	db.update(user).set({ active: false }).where(eq(user.id, 'local')).run();
	expect(() => assertMicrosoftLinkIdentity('local', 'local', identity, tenant)).toThrow();
});

it('enforces identity ownership and one Microsoft identity per user atomically in SQLite', () => {
	db.insert(user).values({ id: 'other', name: 'Other', email: 'other@example.com' }).run();
	db.insert(account).values({ id: 'ms', accountId: identity.oid, providerId: 'microsoft', userId: 'local' }).run();
	expect(() =>
		db.insert(account).values({ id: 'stolen', accountId: identity.oid, providerId: 'microsoft', userId: 'other' }).run()
	).toThrow();
	expect(() =>
		db
			.insert(account)
			.values({ id: 'duplicate', accountId: 'different', providerId: 'microsoft', userId: 'local' })
			.run()
	).toThrow();
	db.insert(account).values({ id: 'password', accountId: 'local', providerId: 'credential', userId: 'local' }).run();
	expect(db.select({ id: account.id }).from(account).where(eq(account.userId, 'local')).all()).toHaveLength(2);
});
