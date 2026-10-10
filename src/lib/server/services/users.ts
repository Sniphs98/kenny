import { and, asc, eq, ne, or } from 'drizzle-orm';
import { db } from '../db';
import { account, apiToken, projectMember, session, user } from '../db/schema';
import { ApiError } from '../errors';
import { parseInput } from '../validation';
import { addMemberSchema, managedUserSchema, updateMemberSchema, updateUserSchema } from '$lib/contracts';
import { requireActiveUser, requireAdmin, requireProjectAccess } from './access';

export function bootstrapAdministrator() {
	db.transaction((tx) => {
		const existing = tx.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).get();
		if (existing) return;
		const first = tx.select({ id: user.id }).from(user).orderBy(asc(user.createdAt), asc(user.id)).get();
		if (first) tx.update(user).set({ role: 'admin' }).where(eq(user.id, first.id)).run();
	});
}

function presentUser(userId: string) {
	const current = db.select().from(user).where(eq(user.id, userId)).get();
	if (!current) throw new ApiError(404, 'Benutzer nicht gefunden.');
	const providers = db.select({ provider: account.providerId }).from(account).where(eq(account.userId, userId)).all();
	return managedUserSchema.parse({ ...current, providers: [...new Set(providers.map((a) => a.provider))] });
}

export function listManagedUsers(actorId: string) {
	requireAdmin(actorId);
	return db
		.select({ id: user.id })
		.from(user)
		.orderBy(asc(user.name))
		.all()
		.map((u) => presentUser(u.id));
}

export function updateUser(actorId: string, userId: string, raw: unknown) {
	const input = parseInput(updateUserSchema, raw);
	db.transaction((tx) => {
		requireAdmin(actorId);
		const target = requireActiveOrExistingUser(userId);
		if (target.role === 'admin' && target.active && (input.role === 'user' || input.active === false)) {
			const other = tx
				.select({ id: user.id })
				.from(user)
				.where(and(eq(user.role, 'admin'), eq(user.active, true), ne(user.id, userId)))
				.get();
			if (!other) throw new ApiError(409, 'Der letzte aktive Administrator kann nicht entfernt werden.');
		}
		if (Object.keys(input).length) tx.update(user).set(input).where(eq(user.id, userId)).run();
		if (input.active === false) {
			tx.delete(session).where(eq(session.userId, userId)).run();
			tx.delete(apiToken).where(eq(apiToken.userId, userId)).run();
		}
	});
	return presentUser(userId);
}

function requireActiveOrExistingUser(userId: string) {
	const target = db.select().from(user).where(eq(user.id, userId)).get();
	if (!target) throw new ApiError(404, 'Benutzer nicht gefunden.');
	return target;
}

export function listMembers(actorId: string, projectId: number) {
	requireProjectAccess(actorId, projectId);
	return db
		.select({ id: user.id, name: user.name, email: user.email, active: user.active, role: projectMember.role })
		.from(projectMember)
		.innerJoin(user, eq(user.id, projectMember.userId))
		.where(eq(projectMember.projectId, projectId))
		.orderBy(asc(user.name))
		.all();
}

export function addMember(actorId: string, projectId: number, raw: unknown) {
	const input = parseInput(addMemberSchema, raw);
	return db.transaction((tx) => {
		requireProjectAccess(actorId, projectId, 'admin');
		const target = tx
			.select()
			.from(user)
			.where(or(eq(user.id, input.user), eq(user.email, input.user.toLowerCase())))
			.get();
		if (!target) throw new ApiError(404, 'Benutzer nicht gefunden.');
		requireActiveUser(target.id);
		const existing = tx
			.select()
			.from(projectMember)
			.where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, target.id)))
			.get();
		if (existing) throw new ApiError(409, 'Benutzer ist bereits Projektmitglied.');
		tx.insert(projectMember).values({ projectId, userId: target.id, role: input.role }).run();
		return listMembers(actorId, projectId).find((m) => m.id === target.id)!;
	});
}

export function changeMember(actorId: string, projectId: number, userId: string, raw: unknown | null) {
	const input = raw === null ? null : parseInput(updateMemberSchema, raw);
	return db.transaction((tx) => {
		requireProjectAccess(actorId, projectId, 'admin');
		const where = and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId));
		const current = tx.select().from(projectMember).where(where).get();
		if (!current) throw new ApiError(404, 'Projektmitglied nicht gefunden.');
		if (current.role === 'admin' && input?.role !== 'admin') {
			const other = tx
				.select()
				.from(projectMember)
				.where(
					and(eq(projectMember.projectId, projectId), eq(projectMember.role, 'admin'), ne(projectMember.userId, userId))
				)
				.get();
			if (!other) throw new ApiError(409, 'Der letzte Projektadministrator kann nicht entfernt werden.');
		}
		if (input) tx.update(projectMember).set(input).where(where).run();
		else tx.delete(projectMember).where(where).run();
		return { ok: true };
	});
}
