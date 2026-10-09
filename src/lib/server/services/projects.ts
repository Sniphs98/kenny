import { createProjectSchema, updateProjectSchema, createColumnSchema, updateColumnSchema } from '$lib/contracts';
import { parseInput } from '../validation';
import { and, asc, eq, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { boardColumn, project, projectMember, ticket } from '../db/schema';
import { ApiError } from '../errors';
import { publish } from '../live';
import { removeFiles, storageKeysForProject } from './attachments';
import { insertDefaultTags } from './tags';
import { requireActiveUser } from './access';
import { str, optStr } from './validate';

export const DEFAULT_COLUMNS = [
	{ name: 'Offen', isDone: false },
	{ name: 'In Arbeit', isDone: false },
	{ name: 'Review', isDone: false },
	{ name: 'Erledigt', isDone: true }
];

export function listProjects(userId?: string) {
	const current = userId ? requireActiveUser(userId) : null;
	const memberships =
		userId && current?.role !== 'admin'
			? db
					.select({ id: projectMember.projectId })
					.from(projectMember)
					.where(eq(projectMember.userId, userId))
					.all()
					.map((p) => p.id)
			: null;
	const counts = db
		.select({
			projectId: ticket.projectId,
			total: sql<number>`count(*)`,
			open: sql<number>`sum(case when ${ticket.closedAt} is null then 1 else 0 end)`
		})
		.from(ticket)
		.groupBy(ticket.projectId)
		.all();
	const byProject = new Map(counts.map((c) => [c.projectId, c]));
	return db
		.select()
		.from(project)
		.where(memberships ? inArray(project.id, memberships) : undefined)
		.orderBy(asc(project.name))
		.all()
		.map((p) => ({
			...p,
			total: byProject.get(p.id)?.total ?? 0,
			open: Number(byProject.get(p.id)?.open ?? 0)
		}));
}

/** Projekt per numerischer ID oder Kürzel (z.B. "WEB") finden */
export function getProject(ref: string | number) {
	const asNum = Number(ref);
	const row = Number.isInteger(asNum)
		? db.select().from(project).where(eq(project.id, asNum)).get()
		: db
				.select()
				.from(project)
				.where(eq(project.key, String(ref).toUpperCase()))
				.get();
	if (!row) throw new ApiError(404, `Projekt "${ref}" nicht gefunden.`);
	return row;
}

export function getColumns(projectId: number) {
	return db
		.select()
		.from(boardColumn)
		.where(eq(boardColumn.projectId, projectId))
		.orderBy(asc(boardColumn.position), asc(boardColumn.id))
		.all();
}

function normalizeKey(key: string) {
	const k = key.trim().toUpperCase();
	if (!/^[A-Z][A-Z0-9]{1,9}$/.test(k))
		throw new ApiError(400, 'Kürzel muss 2–10 Zeichen lang sein (Buchstaben/Ziffern, beginnt mit Buchstabe).');
	return k;
}

function deriveKey(name: string) {
	const letters = name
		.normalize('NFD')
		.replace(/[^A-Za-z0-9]/g, '')
		.toUpperCase();
	let base = (letters.match(/^[A-Z][A-Z0-9]*/)?.[0] ?? 'P').slice(0, 4);
	if (base.length < 2) base = (base + 'PRJ').slice(0, 3);
	let key = base;
	for (let i = 2; db.select().from(project).where(eq(project.key, key)).get(); i++) key = base + i;
	return key;
}

export function createProject(rawInput: unknown, userId: string | null) {
	const input = parseInput(createProjectSchema, rawInput);
	const name = str(input.name, 'name', { max: 120 });
	const key = input.key ? normalizeKey(str(input.key, 'key')) : deriveKey(name);
	if (db.select().from(project).where(eq(project.key, key)).get())
		throw new ApiError(409, `Kürzel "${key}" ist bereits vergeben.`);

	const created = db.transaction((tx) => {
		const p = tx
			.insert(project)
			.values({
				name,
				key,
				description: optStr(input.description, 'description') ?? '',
				color: optStr(input.color, 'color') ?? '#6366f1',
				ownerId: userId
			})
			.returning()
			.get();
		DEFAULT_COLUMNS.forEach((c, i) =>
			tx.insert(boardColumn).values({ projectId: p.id, name: c.name, isDone: c.isDone, position: i }).run()
		);
		insertDefaultTags(tx, p.id);
		if (userId) tx.insert(projectMember).values({ projectId: p.id, userId, role: 'admin' }).run();
		return p;
	});
	publish(created.id);
	return created;
}

export function updateProject(id: number, rawInput: unknown) {
	const input = parseInput(updateProjectSchema, rawInput);
	const patch: Partial<typeof project.$inferInsert> = {};
	if (input.name !== undefined) patch.name = str(input.name, 'name', { max: 120 });
	if (input.description !== undefined) patch.description = optStr(input.description, 'description') ?? '';
	if (input.color !== undefined) patch.color = str(input.color, 'color');
	if (Object.keys(patch).length) db.update(project).set(patch).where(eq(project.id, id)).run();
	publish(id);
	return getProject(id);
}

export async function deleteProject(id: number) {
	getProject(id);
	const files = storageKeysForProject(id);
	db.delete(project).where(eq(project.id, id)).run();
	publish(id, { kind: 'deleted' });
	await removeFiles(files);
}

export function addColumn(projectId: number, rawInput: unknown) {
	const input = parseInput(createColumnSchema, rawInput);
	const cols = getColumns(projectId);
	const created = db
		.insert(boardColumn)
		.values({
			projectId,
			name: str(input.name, 'name', { max: 60 }),
			isDone: input.isDone === true,
			isBacklog: input.isBacklog === true,
			position: cols.length ? Math.max(...cols.map((c) => c.position)) + 1 : 0
		})
		.returning()
		.get();
	publish(projectId);
	return created;
}

export function updateColumn(projectId: number, columnId: number, rawInput: unknown) {
	const input = parseInput(updateColumnSchema, rawInput);
	const col = db
		.select()
		.from(boardColumn)
		.where(and(eq(boardColumn.id, columnId), eq(boardColumn.projectId, projectId)))
		.get();
	if (!col) throw new ApiError(404, 'Spalte nicht gefunden.');

	db.transaction((tx) => {
		const patch: Partial<typeof boardColumn.$inferInsert> = {};
		if (input.name !== undefined) patch.name = str(input.name, 'name', { max: 60 });
		if (input.isDone !== undefined) patch.isDone = input.isDone === true;
		if (input.isBacklog !== undefined) patch.isBacklog = input.isBacklog === true;
		if (Object.keys(patch).length) tx.update(boardColumn).set(patch).where(eq(boardColumn.id, columnId)).run();

		// Abgeschlossen-Status der Tickets an die Spalte anpassen
		if (patch.isDone !== undefined && patch.isDone !== col.isDone) {
			tx.update(ticket)
				.set({ closedAt: patch.isDone ? new Date() : null })
				.where(eq(ticket.columnId, columnId))
				.run();
		}

		if (typeof input.position === 'number') {
			const others = getColumns(projectId).filter((c) => c.id !== columnId);
			const pos = Math.max(0, Math.min(others.length, Math.round(input.position)));
			others.splice(pos, 0, col);
			others.forEach((c, i) => tx.update(boardColumn).set({ position: i }).where(eq(boardColumn.id, c.id)).run());
		}
	});
	publish(projectId);
	return getColumns(projectId);
}

export function deleteColumn(projectId: number, columnId: number) {
	const cols = getColumns(projectId);
	if (!cols.some((c) => c.id === columnId)) throw new ApiError(404, 'Spalte nicht gefunden.');
	if (cols.length <= 1) throw new ApiError(409, 'Die letzte Spalte kann nicht gelöscht werden.');
	const used = db
		.select({ n: sql<number>`count(*)` })
		.from(ticket)
		.where(eq(ticket.columnId, columnId))
		.get();
	if (used && used.n > 0) throw new ApiError(409, 'Die Spalte enthält noch Tickets. Bitte zuerst verschieben.');
	db.delete(boardColumn).where(eq(boardColumn.id, columnId)).run();
	publish(projectId);
}
