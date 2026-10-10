import { requireProjectAccess, visibleUsers } from './access';
import { projectMember } from '../db/schema';
import { createTicketSchema, updateTicketSchema, createLinkSchema, ticketSearchSchema } from '$lib/contracts';
import { parseInput } from '../validation';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../db';
import {
	boardColumn,
	intakeForm,
	LINK_TYPES,
	PRIORITIES,
	project,
	ticket,
	ticketLink,
	user,
	type LinkType,
	type Ticket
} from '../db/schema';
import { ApiError } from '../errors';
import { publish } from '../live';
import { notifyTicket } from './notifications';
import { searchTokens } from '$lib/search';
import { getColumns, getProject, listProjects } from './projects';
import { setTicketTags, tagsByTicket } from './tags';
import { countAttachments, listAttachments, removeFiles, storageKeysForTickets } from './attachments';
import { oneOf, optDate, optInt, optStr, str } from './validate';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ticket per ID (z.B. 42) oder Schlüssel (z.B. "WEB-12") finden.
 */
export function resolveTicket(ref: string | number, tx: Tx | typeof db = db): Ticket {
	const s = String(ref).trim();
	let row: Ticket | undefined;
	const keyMatch = s.match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
	if (keyMatch) {
		row = tx
			.select({ t: ticket })
			.from(ticket)
			.innerJoin(project, eq(project.id, ticket.projectId))
			.where(and(eq(project.key, keyMatch[1].toUpperCase()), eq(ticket.number, Number(keyMatch[2]))))
			.get()?.t;
	} else if (/^\d+$/.test(s)) {
		row = tx
			.select()
			.from(ticket)
			.where(eq(ticket.id, Number(s)))
			.get();
	}
	if (!row) throw new ApiError(404, `Ticket "${s}" nicht gefunden.`);
	return row;
}

/** Öffentliche Darstellung eines Tickets für API und Oberfläche */
function present(t: Ticket, projectKey: string, column?: { name: string; isDone: boolean }) {
	return {
		id: t.id,
		key: `${projectKey}-${t.number}`,
		projectId: t.projectId,
		number: t.number,
		title: t.title,
		description: t.description,
		priority: t.priority,
		columnId: t.columnId,
		status: column?.name ?? null,
		closed: t.closedAt !== null,
		closedAt: t.closedAt,
		position: t.position,
		parentId: t.parentId,
		assigneeId: t.assigneeId,
		startDate: t.startDate,
		dueDate: t.dueDate,
		createdAt: t.createdAt,
		updatedAt: t.updatedAt
	};
}
export type { TicketDto, TicketListItem } from '$lib/contracts';
import type { TicketDetail, TicketDto, TicketListItem, TicketSearchResult } from '$lib/contracts';

export function getTicket(ref: string | number): TicketDto {
	const t = resolveTicket(ref);
	const p = getProject(t.projectId);
	const col = db.select().from(boardColumn).where(eq(boardColumn.id, t.columnId)).get();
	return { ...present(t, p.key, col), tags: tagsByTicket([t.id]).get(t.id) ?? [] };
}

/** Alle Tickets eines Projekts inkl. Unteraufgaben-Zähler und Abhängigkeiten */
export function listTickets(projectId: number, filter: { closed?: boolean } = {}): TicketListItem[] {
	const p = getProject(projectId);
	const cols = new Map(getColumns(projectId).map((c) => [c.id, c]));
	const conds = [eq(ticket.projectId, projectId)];
	if (filter.closed === true) conds.push(sql`${ticket.closedAt} is not null`);
	if (filter.closed === false) conds.push(isNull(ticket.closedAt));

	const rows = db
		.select({ t: ticket, assigneeName: user.name })
		.from(ticket)
		.leftJoin(user, eq(user.id, ticket.assigneeId))
		.where(and(...conds))
		.orderBy(asc(ticket.position), asc(ticket.number))
		.all();

	const ids = rows.map((r) => r.t.id);
	const deps = ids.length
		? db
				.select({ sourceId: ticketLink.sourceId, targetId: ticketLink.targetId, closedAt: ticket.closedAt })
				.from(ticketLink)
				.innerJoin(ticket, eq(ticket.id, ticketLink.targetId))
				.where(and(eq(ticketLink.type, 'depends_on'), inArray(ticketLink.sourceId, ids)))
				.all()
		: [];
	const subs = db
		.select({
			parentId: ticket.parentId,
			total: sql<number>`count(*)`,
			done: sql<number>`sum(case when ${ticket.closedAt} is null then 0 else 1 end)`
		})
		.from(ticket)
		.where(eq(ticket.projectId, projectId))
		.groupBy(ticket.parentId)
		.all();
	const subMap = new Map(subs.map((s) => [s.parentId, s]));
	const tags = tagsByTicket(ids);
	const attachments = countAttachments(projectId);

	return rows.map(({ t, assigneeName }) => {
		const myDeps = deps.filter((d) => d.sourceId === t.id);
		const s = subMap.get(t.id);
		return {
			...present(t, p.key, cols.get(t.columnId)),
			tags: tags.get(t.id) ?? [],
			assigneeName,
			subtaskCount: s?.total ?? 0,
			subtaskDone: Number(s?.done ?? 0),
			attachmentCount: attachments.get(t.id) ?? 0,
			dependsOn: myDeps.map((d) => d.targetId),
			openBlockers: myDeps.filter((d) => d.closedAt === null).length
		};
	});
}

/**
 * Tickets aus allen Projekten, die der Benutzer sehen darf (z.B. für KI-Assistenten über MCP).
 * Mit "project" nur dieses Projekt; Zugriff wird wie bei der REST-API geprüft.
 */
export function searchTickets(userId: string, rawInput: unknown): TicketSearchResult {
	const input = parseInput(ticketSearchSchema, rawInput ?? {});
	const projects = input.project ? [getProject(input.project)] : listProjects(userId);
	for (const p of projects) requireProjectAccess(userId, p.id);

	let assigneeId: string | null | undefined;
	if (input.assignee === 'me') assigneeId = userId;
	else if (input.assignee === 'none') assigneeId = null;
	else if (input.assignee !== undefined) {
		const ref = input.assignee.toLowerCase();
		const match = visibleUsers(userId).find((u) => u.id === input.assignee || u.email.toLowerCase() === ref);
		if (!match) throw new ApiError(400, `Benutzer "${input.assignee}" nicht gefunden.`);
		assigneeId = match.id;
	}
	const query = input.query?.toLowerCase();

	const candidates = projects
		.flatMap((p) => listTickets(p.id, { closed: input.closed }))
		.filter((t) => assigneeId === undefined || t.assigneeId === assigneeId);
	// Mit Suchbegriff nach Treffergüte: ganzer Ausdruck vor einzelnen Wörtern (siehe searchRank)
	const tickets = !query
		? candidates
		: candidates
				.map((t) => ({ t, rank: searchRank(t, query) }))
				.filter(({ rank }) => rank > 0)
				.sort((a, b) => b.rank - a.rank || Number(a.t.closed) - Number(b.t.closed))
				.map(({ t }) => t);
	return { total: tickets.length, tickets: tickets.slice(0, input.limit ?? 50) };
}

/**
 * Treffergüte eines Tickets für einen (kleingeschriebenen) Suchbegriff; 0 = kein Treffer.
 * Der ganze Ausdruck zählt mehr als einzelne Wörter: Schlüssel genau, Schlüssel-Anfang, Titel-Anfang,
 * Titel, Beschreibung; danach alle Wörter im Schlüssel oder Titel, zuletzt alle Wörter irgendwo.
 */
function searchRank(t: TicketListItem, query: string) {
	const key = t.key.toLowerCase();
	const title = t.title.toLowerCase();
	const description = t.description.toLowerCase();
	if (key === query) return 7;
	if (key.startsWith(query)) return 6;
	if (title.startsWith(query)) return 5;
	if (title.includes(query)) return 4;
	if (description.includes(query)) return 3;
	const tokens = searchTokens(query);
	if (tokens.length < 2) return 0;
	if (tokens.every((w) => key.includes(w) || title.includes(w))) return 2;
	return tokens.every((w) => key.includes(w) || title.includes(w) || description.includes(w)) ? 1 : 0;
}

/** Ticket-Detail wie GET /api/v1/tickets/:ticket, mit Zugriffsprüfung für den Benutzer */
export function viewTicket(ref: string | number, userId: string): TicketDetail {
	requireProjectAccess(userId, resolveTicket(ref).projectId);
	const { ticket, parent, subtasks, links, attachments, assignee, submission } = getTicketDetail(ref, userId);
	return { ...ticket, parent, subtasks, links, attachments, assignee, submission };
}

/** Detailansicht: Ticket mit Projekt, Unteraufgaben, übergeordnetem Ticket und Verknüpfungen */
export function getTicketDetail(ref: string | number, actorId?: string) {
	const t = resolveTicket(ref);
	const p = getProject(t.projectId);
	const cols = getColumns(p.id);
	const colMap = new Map(cols.map((c) => [c.id, c]));

	const other = alias(ticket, 'other');
	const otherProject = alias(project, 'other_project');
	const linkRows = db
		.select({ link: ticketLink, other, otherKey: otherProject.key })
		.from(ticketLink)
		.innerJoin(
			other,
			or(
				and(eq(ticketLink.sourceId, t.id), eq(other.id, ticketLink.targetId)),
				and(eq(ticketLink.targetId, t.id), eq(other.id, ticketLink.sourceId))
			)
		)
		.innerJoin(otherProject, eq(otherProject.id, other.projectId))
		.where(or(eq(ticketLink.sourceId, t.id), eq(ticketLink.targetId, t.id)))
		.all();

	const visibleLinks = actorId
		? linkRows.filter((row) => {
				try {
					requireProjectAccess(actorId, row.other.projectId);
					return true;
				} catch (e) {
					if (e instanceof ApiError && e.status === 404) return false;
					throw e;
				}
			})
		: linkRows;
	const links = visibleLinks.map(({ link, other, otherKey }) => {
		const outgoing = link.sourceId === t.id;
		// Aus Sicht dieses Tickets beschreiben
		const relation: TicketDetail['links'][number]['relation'] =
			link.type === 'relates' ? 'relates' : outgoing ? 'depends_on' : 'blocks';
		return {
			id: link.id,
			type: link.type,
			relation,
			ticket: {
				id: other.id,
				key: `${otherKey}-${other.number}`,
				title: other.title,
				closed: other.closedAt !== null
			}
		};
	});

	const subtasks = db
		.select()
		.from(ticket)
		.where(eq(ticket.parentId, t.id))
		.orderBy(asc(ticket.number))
		.all()
		.map((s) => present(s, p.key, colMap.get(s.columnId)));

	const parent = t.parentId ? db.select().from(ticket).where(eq(ticket.id, t.parentId)).get() : null;
	const assignee = t.assigneeId
		? db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, t.assigneeId)).get()
		: null;

	return {
		ticket: { ...present(t, p.key, colMap.get(t.columnId)), tags: tagsByTicket([t.id]).get(t.id) ?? [] },
		project: p,
		columns: cols,
		parent: parent ? present(parent, p.key, colMap.get(parent.columnId)) : null,
		subtasks,
		links,
		attachments: listAttachments(t.id),
		assignee: assignee ?? null,
		submission:
			t.intakeFormId !== null || t.reporterEmail !== null
				? {
						form: t.intakeFormId
							? (db.select({ name: intakeForm.name }).from(intakeForm).where(eq(intakeForm.id, t.intakeFormId)).get()
									?.name ?? null)
							: null,
						email: t.reporterEmail
					}
				: null
	};
}

function nextPosition(tx: Tx, columnId: number) {
	const r = tx
		.select({ max: sql<number | null>`max(${ticket.position})` })
		.from(ticket)
		.where(eq(ticket.columnId, columnId))
		.get();
	return (r?.max ?? -1) + 1;
}

/** Spalte über ID oder Namen finden (für die API praktisch: {"column": "In Arbeit"}) */
function resolveColumn(projectId: number, ref: unknown) {
	const cols = getColumns(projectId);
	const col =
		typeof ref === 'number' || /^\d+$/.test(String(ref))
			? cols.find((c) => c.id === Number(ref))
			: cols.find((c) => c.name.toLowerCase() === String(ref).trim().toLowerCase());
	if (!col) throw new ApiError(400, `Spalte "${ref}" gibt es in diesem Projekt nicht.`);
	return col;
}

function checkParent(tx: Tx, t: { id?: number; projectId: number }, parentRef: unknown) {
	if (parentRef === null || parentRef === undefined || parentRef === '') return null;
	const parent = resolveTicket(String(parentRef), tx);
	if (parent.projectId !== t.projectId)
		throw new ApiError(400, 'Unteraufgaben müssen im selben Projekt liegen wie das übergeordnete Ticket.');
	// Zyklen verhindern: das neue Elternticket darf kein Nachfahre dieses Tickets sein
	for (let cur: Ticket | undefined = parent; cur;) {
		if (cur.id === t.id) throw new ApiError(400, 'Ein Ticket kann nicht Unteraufgabe von sich selbst sein.');
		cur = cur.parentId ? tx.select().from(ticket).where(eq(ticket.id, cur.parentId)).get() : undefined;
	}
	return parent.id;
}

function checkDates(start: string | null, due: string | null) {
	if (start && due && start > due) throw new ApiError(400, 'Startdatum liegt nach dem Fälligkeitsdatum.');
}

function checkAssignee(tx: Tx, id: unknown, projectId: number) {
	if (id === null || id === undefined || id === '') return null;
	const u = tx
		.select({ id: user.id })
		.from(user)
		.where(or(eq(user.id, String(id)), eq(user.email, String(id))))
		.get();
	if (!u) throw new ApiError(400, `Benutzer "${id}" nicht gefunden.`);
	const active = tx.select({ active: user.active }).from(user).where(eq(user.id, u.id)).get();
	const membership = tx
		.select()
		.from(projectMember)
		.where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, u.id)))
		.get();
	if (!active?.active || !membership) throw new ApiError(400, 'Zuständige müssen aktive Projektmitglieder sein.');
	return u.id;
}

/** Herkunft eines Tickets aus einem Formular (nur intern, nicht über die API setzbar) */
export type TicketOrigin = { intakeFormId: number; reporterEmail: string | null };

export function createTicket(
	projectRef: string | number,
	rawInput: unknown,
	userId: string | null,
	origin?: TicketOrigin
) {
	const input = parseInput(createTicketSchema, rawInput);
	const p = getProject(projectRef);
	const cols = getColumns(p.id);
	const col =
		input.column !== undefined && input.column !== null
			? resolveColumn(p.id, input.column)
			: input.columnId !== undefined
				? resolveColumn(p.id, input.columnId)
				: (cols.find((c) => !c.isDone) ?? cols[0]);
	if (!col) throw new ApiError(409, 'Projekt hat keine Spalten.');

	const title = str(input.title, 'title', { max: 300 });
	const startDate = optDate(input.startDate, 'startDate');
	const dueDate = optDate(input.dueDate, 'dueDate');
	checkDates(startDate, dueDate);

	const created = db.transaction((tx) => {
		const { ticketCounter } = tx
			.update(project)
			.set({ ticketCounter: sql`${project.ticketCounter} + 1` })
			.where(eq(project.id, p.id))
			.returning({ ticketCounter: project.ticketCounter })
			.get();

		const t = tx
			.insert(ticket)
			.values({
				projectId: p.id,
				number: ticketCounter,
				title,
				description: optStr(input.description, 'description') ?? '',
				priority: input.priority !== undefined ? oneOf(input.priority, PRIORITIES, 'priority') : 'medium',
				columnId: col.id,
				position: nextPosition(tx, col.id),
				parentId: checkParent(tx, { projectId: p.id }, input.parentId ?? input.parent),
				assigneeId: checkAssignee(tx, input.assigneeId ?? input.assignee, p.id),
				startDate,
				dueDate,
				closedAt: col.isDone ? new Date() : null,
				createdById: userId,
				intakeFormId: origin?.intakeFormId ?? null,
				reporterEmail: origin?.reporterEmail ?? null
			})
			.returning()
			.get();

		const dependsOn = input.dependsOn ?? [];
		if (!Array.isArray(dependsOn)) throw new ApiError(400, 'Feld "dependsOn" muss eine Liste sein.');
		for (const ref of dependsOn) insertLink(tx, t, String(ref), 'depends_on', userId);

		const relatesTo = input.relatesTo ?? [];
		if (!Array.isArray(relatesTo)) throw new ApiError(400, 'Feld "relatesTo" muss eine Liste sein.');
		for (const ref of relatesTo) insertLink(tx, t, String(ref), 'relates', userId);

		if (input.tags !== undefined) setTicketTags(tx, t.id, p.id, input.tags);

		return t;
	});
	const result = getTicket(created.id);
	publish(p.id, { ticket: result.key });
	notifyTicket('created', p.id, created.id);
	if (created.assigneeId) notifyTicket('assigned', p.id, created.id);
	return result;
}

export function updateTicket(ref: string | number, rawInput: unknown) {
	const input = parseInput(updateTicketSchema, rawInput);
	const t = resolveTicket(ref);
	db.transaction((tx) => {
		const patch: Partial<typeof ticket.$inferInsert> = {};
		if (input.title !== undefined) patch.title = str(input.title, 'title', { max: 300 });
		if (input.description !== undefined) patch.description = optStr(input.description, 'description') ?? '';
		if (input.priority !== undefined) patch.priority = oneOf(input.priority, PRIORITIES, 'priority');
		if (input.startDate !== undefined) patch.startDate = optDate(input.startDate, 'startDate');
		if (input.dueDate !== undefined) patch.dueDate = optDate(input.dueDate, 'dueDate');
		if (input.assigneeId !== undefined || input.assignee !== undefined)
			patch.assigneeId = checkAssignee(tx, input.assigneeId ?? input.assignee, t.projectId);
		if (input.parentId !== undefined || input.parent !== undefined)
			patch.parentId = checkParent(tx, t, input.parentId ?? input.parent);
		checkDates(
			patch.startDate !== undefined ? patch.startDate : t.startDate,
			patch.dueDate !== undefined ? patch.dueDate : t.dueDate
		);
		if (Object.keys(patch).length) tx.update(ticket).set(patch).where(eq(ticket.id, t.id)).run();
		if (input.tags !== undefined) {
			setTicketTags(tx, t.id, t.projectId, input.tags);
			if (!Object.keys(patch).length) tx.update(ticket).set({ updatedAt: new Date() }).where(eq(ticket.id, t.id)).run();
		}

		const colRef = input.column ?? input.columnId;
		if (colRef !== undefined || input.position !== undefined) {
			const col = colRef !== undefined ? resolveColumn(t.projectId, colRef) : resolveColumn(t.projectId, t.columnId);
			moveTicket(tx, t, col, optInt(input.position, 'position'));
		}
	});
	const result = getTicket(t.id);
	publish(t.projectId, { ticket: result.key });
	notifyChanges(t, resolveTicket(t.id));
	return result;
}

/** Benachrichtigungen für Statuswechsel und neue Zuständigkeit (Vergleich vorher/nachher) */
function notifyChanges(before: Ticket, after: Ticket) {
	if (before.closedAt === null && after.closedAt !== null) notifyTicket('closed', after.projectId, after.id);
	if (after.assigneeId && after.assigneeId !== before.assigneeId) notifyTicket('assigned', after.projectId, after.id);
}

/** Ticket in eine Spalte verschieben, an Position einsortieren und Status anpassen */
function moveTicket(tx: Tx, t: Ticket, col: { id: number; isDone: boolean }, position: number | null) {
	const siblings = tx
		.select({ id: ticket.id })
		.from(ticket)
		.where(and(eq(ticket.columnId, col.id), sql`${ticket.id} != ${t.id}`))
		.orderBy(asc(ticket.position), asc(ticket.number))
		.all();
	const pos = position === null ? siblings.length : Math.max(0, Math.min(siblings.length, position));
	siblings.splice(pos, 0, { id: t.id });
	siblings.forEach((s, i) => tx.update(ticket).set({ position: i }).where(eq(ticket.id, s.id)).run());

	const wasDone = t.closedAt !== null;
	tx.update(ticket)
		.set({
			columnId: col.id,
			closedAt: col.isDone ? (wasDone ? t.closedAt : new Date()) : null
		})
		.where(eq(ticket.id, t.id))
		.run();
}

export function closeTicket(ref: string | number) {
	const t = resolveTicket(ref);
	const col = getColumns(t.projectId).find((c) => c.isDone);
	if (!col) throw new ApiError(409, 'Das Projekt hat keine Spalte, die als "erledigt" markiert ist.');
	db.transaction((tx) => moveTicket(tx, t, col, null));
	const result = getTicket(t.id);
	publish(t.projectId, { ticket: result.key });
	notifyChanges(t, resolveTicket(t.id));
	return result;
}

export function reopenTicket(ref: string | number) {
	const t = resolveTicket(ref);
	const col = getColumns(t.projectId).find((c) => !c.isDone);
	if (!col) throw new ApiError(409, 'Das Projekt hat keine offene Spalte.');
	db.transaction((tx) => moveTicket(tx, t, col, null));
	const result = getTicket(t.id);
	publish(t.projectId, { ticket: result.key });
	return result;
}

export async function deleteTicket(ref: string | number) {
	const t = resolveTicket(ref);
	// Anhänge von Ticket und Unteraufgaben merken, die Zeilen löscht die Datenbank per Cascade
	const files = storageKeysForTickets([t.id]);
	db.delete(ticket).where(eq(ticket.id, t.id)).run();
	publish(t.projectId);
	await removeFiles(files);
}

/** Prüft, ob "from" (transitiv) von "to" abhängt */
function dependsTransitively(tx: Tx, from: number, to: number) {
	const seen = new Set<number>();
	const stack = [from];
	while (stack.length) {
		const cur = stack.pop()!;
		if (cur === to) return true;
		if (seen.has(cur)) continue;
		seen.add(cur);
		const next = tx
			.select({ id: ticketLink.targetId })
			.from(ticketLink)
			.where(and(eq(ticketLink.sourceId, cur), eq(ticketLink.type, 'depends_on')))
			.all();
		stack.push(...next.map((n) => n.id));
	}
	return false;
}

function insertLink(tx: Tx, source: Ticket, targetRef: string, type: LinkType, actorId?: string | null) {
	const target = resolveTicket(targetRef, tx);
	if (actorId) requireProjectAccess(actorId, target.projectId, 'member');
	if (target.id === source.id) throw new ApiError(400, 'Ein Ticket kann nicht mit sich selbst verknüpft werden.');
	if (type === 'depends_on' && dependsTransitively(tx, target.id, source.id))
		throw new ApiError(400, 'Diese Abhängigkeit würde einen Zyklus erzeugen.');
	const existing = tx
		.select()
		.from(ticketLink)
		.where(
			type === 'relates'
				? or(
						and(eq(ticketLink.sourceId, source.id), eq(ticketLink.targetId, target.id)),
						and(eq(ticketLink.sourceId, target.id), eq(ticketLink.targetId, source.id))
					)
				: and(eq(ticketLink.sourceId, source.id), eq(ticketLink.targetId, target.id))
		)
		.all()
		.find((l) => l.type === type);
	if (existing) return existing;
	return tx.insert(ticketLink).values({ sourceId: source.id, targetId: target.id, type }).returning().get();
}

/**
 * Verknüpfung anlegen. type:
 * - depends_on: dieses Ticket setzt das Ziel voraus
 * - blocks: dieses Ticket ist Voraussetzung für das Ziel
 * - relates: einfache Verlinkung
 */
export function addLink(ref: string | number, rawInput: unknown, actorId?: string) {
	const input = parseInput(createLinkSchema, rawInput);
	const t = resolveTicket(ref);
	if (actorId)
		requireProjectAccess(actorId, resolveTicket(String(input.target ?? input.targetId ?? '')).projectId, 'member');
	const type = oneOf(input.type ?? 'relates', [...LINK_TYPES, 'blocks'] as const, 'type');
	const targetRef = str(String(input.target ?? input.targetId ?? ''), 'target');
	const link = db.transaction((tx) => {
		if (type === 'blocks') return insertLink(tx, resolveTicket(targetRef, tx), String(t.id), 'depends_on', actorId);
		return insertLink(tx, t, targetRef, type, actorId);
	});
	publish(t.projectId);
	return link;
}

export function removeLink(ref: string | number, linkId: number) {
	const t = resolveTicket(ref);
	const res = db
		.delete(ticketLink)
		.where(and(eq(ticketLink.id, linkId), or(eq(ticketLink.sourceId, t.id), eq(ticketLink.targetId, t.id))))
		.run();
	if (res.changes === 0) throw new ApiError(404, 'Verknüpfung nicht gefunden.');
	publish(t.projectId);
}

/** Alle Abhängigkeiten innerhalb eines Projekts (für die Pfeile im Gantt-Chart) */
export function listDependencies(projectId: number) {
	const src = alias(ticket, 'src');
	return db
		.select({ id: ticketLink.id, sourceId: ticketLink.sourceId, targetId: ticketLink.targetId })
		.from(ticketLink)
		.innerJoin(src, eq(src.id, ticketLink.sourceId))
		.where(and(eq(src.projectId, projectId), eq(ticketLink.type, 'depends_on')))
		.all();
}
