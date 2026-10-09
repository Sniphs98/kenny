import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { attachment, projectMember, ticket, user } from '../db/schema';
import { ApiError } from '../errors';
import { getProject } from './projects';
import { resolveTicket } from './tickets';
import type { ProjectRole } from '$lib/contracts';

export function requireActiveUser(userId: string) {
	const current = db.select().from(user).where(eq(user.id, userId)).get();
	if (!current?.active) throw new ApiError(401, 'Konto gesperrt oder nicht verfügbar.');
	return current;
}

export function requireAdmin(userId: string) {
	const current = requireActiveUser(userId);
	if (current.role !== 'admin') throw new ApiError(403, 'Administratorrechte erforderlich.');
	return current;
}

export function requireProjectAccess(userId: string, projectId: number, minimum: ProjectRole = 'reader'): ProjectRole {
	const current = requireActiveUser(userId);
	if (current.role === 'admin') return 'admin';
	const member = db
		.select()
		.from(projectMember)
		.where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)))
		.get();
	if (!member) throw new ApiError(404, 'Projekt nicht gefunden oder kein Zugriff.');
	const rank = { reader: 0, member: 1, admin: 2 };
	if (rank[member.role] < rank[minimum]) throw new ApiError(403, 'Unzureichende Projektberechtigungen.');
	return member.role;
}

/** Apply the same policy to every REST resource before it is read or mutated. */
export function authorizeResource(
	userId: string,
	method: string,
	params: {
		project?: string;
		ticket?: string;
		attachment?: string;
	},
	settingsResource = false
) {
	const minimum = method === 'GET' || method === 'HEAD' ? 'reader' : settingsResource ? 'admin' : 'member';
	if (params.project) return requireProjectAccess(userId, getProject(params.project).id, minimum);
	if (params.ticket) return requireProjectAccess(userId, resolveTicket(params.ticket).projectId, minimum);
	if (params.attachment) {
		const row = db
			.select({ projectId: ticket.projectId })
			.from(attachment)
			.innerJoin(ticket, eq(ticket.id, attachment.ticketId))
			.where(eq(attachment.id, Number(params.attachment)))
			.get();
		if (!row) throw new ApiError(404, 'Anhang nicht gefunden.');
		return requireProjectAccess(userId, row.projectId, minimum);
	}
}

/** Public directory: only active users sharing a project, or all users for an instance admin. */
export function visibleUsers(userId: string) {
	const current = requireActiveUser(userId);
	const fields = { id: user.id, name: user.name, email: user.email };
	if (current.role === 'admin') return db.select(fields).from(user).where(eq(user.active, true)).all();
	const projects = db
		.select({ id: projectMember.projectId })
		.from(projectMember)
		.where(eq(projectMember.userId, userId))
		.all()
		.map((p) => p.id);
	const ids = projects.length
		? db
				.select({ id: projectMember.userId })
				.from(projectMember)
				.where(inArray(projectMember.projectId, projects))
				.all()
				.map((u) => u.id)
		: [];
	return db
		.select(fields)
		.from(user)
		.where(and(eq(user.active, true), inArray(user.id, [...ids, userId])))
		.all();
}

export function projectUsers(projectId: number) {
	return db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.innerJoin(projectMember, eq(projectMember.userId, user.id))
		.where(and(eq(projectMember.projectId, projectId), eq(user.active, true)))
		.all();
}
