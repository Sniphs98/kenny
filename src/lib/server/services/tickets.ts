import { requireProjectAccess, visibleUsers } from './access';
import { projectMember } from '../db/schema';
import {
	createTicketSchema,
	updateTicketSchema,
	createLinkSchema,
	reorderTicketsSchema,
	ticketSearchSchema,
	createCommentSchema
} from '#lib/contracts/index.js';
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
	ticketAssignee,
	ticketComment,
	ticketLink,
	user,
	type LinkType,
	type Ticket
} from '../db/schema';
import { ApiError } from '../errors';
import { publish } from '../live';
import { notifyTicket } from './notifications';
import { notifyEmail } from './email-notifications.js';
import { searchTokens } from '#lib/search.js';
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
	if (!row) throw new ApiError(404, `Aufgabe "${s}" nicht gefunden.`);
	return row;
}

type Person = { id: string; name: string; email: string };

/** Zuständige je Ticket in der gewählten Reihenfolge */
export function assigneesByTicket(ids: number[], tx: Tx | typeof db = db) {
	const map = new Map<number, Person[]>();
	if (!ids.length) return map;
	const rows = tx
		.select({ ticketId: ticketAssignee.ticketId, id: user.id, name: user.name, email: user.email })
		.from(ticketAssignee)
		.innerJoin(user, eq(user.id, ticketAssignee.userId))
		.where(inArray(ticketAssignee.ticketId, ids))
		.orderBy(asc(ticketAssignee.position), asc(user.name))
		.all();
	for (const { ticketId, ...person } of rows) {
		if (!map.has(ticketId)) map.set(ticketId, []);
		map.get(ticketId)!.push(person);
	}
	return map;
}

/** Öffentliche Darstellung eines Tickets für API und Oberfläche */
function present(
	t: Ticket,
	projectKey: string,
	column?: { name: string; isDone: boolean },
	assignees: { id: string }[] = []
) {
	return {
		id: t.id,
		key: `${projectKey}-${t.number}`,
		kind: t.kind,
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
		assigneeId: assignees[0]?.id ?? null,
		assigneeIds: assignees.map((a) => a.id),
		startDate: t.startDate,
		dueDate: t.dueDate,
		createdAt: t.createdAt,
		updatedAt: t.updatedAt
	};
}
export type { TicketDto, TicketListItem } from '#lib/contracts/index.js';
import type { TicketDetail, TicketDto, TicketListItem, TicketSearchResult } from '#lib/contracts/index.js';

/** Gestartete, noch offene Versionen wechseln automatisch in die zweite aktive Projektspalte. */
function advanceStartedVersions(projectId: number) {
	const active = getColumns(projectId).filter((column) => !column.isBacklog && !column.isDone);
	const [open, inProgress] = active;
	if (!open || !inProgress) return;
	const started = db
		.select()
		.from(ticket)
		.where(
			and(
				eq(ticket.projectId, projectId),
				eq(ticket.kind, 'version'),
				eq(ticket.columnId, open.id),
				isNull(ticket.closedAt),
				sql`${ticket.startDate} <= ${new Date().toISOString().slice(0, 10)}`
			)
		)
		.all();
	if (!started.length) return;
	db.transaction((tx) => started.forEach((version) => moveTicket(tx, version, inProgress, null)));
	publish(projectId);
}

export function getTicket(ref: string | number): TicketDto {
	const t = resolveTicket(ref);
	const p = getProject(t.projectId);
	const col = db.select().from(boardColumn).where(eq(boardColumn.id, t.columnId)).get();
	return {
		...present(t, p.key, col, assigneesByTicket([t.id]).get(t.id)),
		tags: tagsByTicket([t.id]).get(t.id) ?? []
	};
}

/** Alle Tickets eines Projekts inkl. Unteraufgaben-Zähler und Abhängigkeiten */
export function listTickets(projectId: number, filter: { closed?: boolean } = {}): TicketListItem[] {
	advanceStartedVersions(projectId);
	const p = getProject(projectId);
	const cols = new Map(getColumns(projectId).map((c) => [c.id, c]));
	const conds = [eq(ticket.projectId, projectId)];
	if (filter.closed === true) conds.push(sql`${ticket.closedAt} is not null`);
	if (filter.closed === false) conds.push(isNull(ticket.closedAt));

	const rows = db
		.select({ t: ticket })
		.from(ticket)
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
	const assignees = assigneesByTicket(ids);
	const attachments = countAttachments(projectId);

	return rows.map(({ t }) => {
		const myDeps = deps.filter((d) => d.sourceId === t.id);
		const s = subMap.get(t.id);
		return {
			...present(t, p.key, cols.get(t.columnId), assignees.get(t.id)),
			tags: tags.get(t.id) ?? [],
			submitted: t.intakeFormId !== null || t.reporterEmail !== null,
			boardGroup: t.boardGroup,
			assigneeName: assignees.get(t.id)?.[0]?.name ?? null,
			assignees: (assignees.get(t.id) ?? []).map(({ id, name }) => ({ id, name })),
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
		.filter(
			(t) =>
				assigneeId === undefined || (assigneeId === null ? !t.assigneeIds.length : t.assigneeIds.includes(assigneeId))
		);
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
	const { ticket, parent, subtasks, links, attachments, comments, assignee, assignees, submission } = getTicketDetail(
		ref,
		userId
	);
	return { ...ticket, parent, subtasks, links, attachments, comments, assignee, assignees, submission };
}

const commentFields = {
	id: ticketComment.id,
	ticketId: ticketComment.ticketId,
	body: ticketComment.body,
	internal: ticketComment.internal,
	authorId: ticketComment.authorId,
	authorName: user.name,
	authorImage: user.image,
	createdAt: ticketComment.createdAt
};

function commentsForTicket(ticketId: number) {
	return db
		.select(commentFields)
		.from(ticketComment)
		.leftJoin(user, eq(ticketComment.authorId, user.id))
		.where(eq(ticketComment.ticketId, ticketId))
		.orderBy(asc(ticketComment.createdAt), asc(ticketComment.id))
		.all();
}

export function listComments(ref: string | number, actorId: string) {
	const t = resolveTicket(ref);
	requireProjectAccess(actorId, t.projectId);
	return commentsForTicket(t.id);
}

export function addComment(ref: string | number, raw: unknown, actorId: string) {
	const t = resolveTicket(ref);
	requireProjectAccess(actorId, t.projectId, 'member');
	const input = parseInput(createCommentSchema, raw);
	const row = db.insert(ticketComment).values({ ticketId: t.id, authorId: actorId, ...input }).returning().get();
	publish(t.projectId, { ticket: `${getProject(t.projectId).key}-${t.number}` });
	const result = db
		.select(commentFields)
		.from(ticketComment)
		.leftJoin(user, eq(ticketComment.authorId, user.id))
		.where(eq(ticketComment.id, row.id))
		.get()!;
	if (!result.internal) {
		notifyEmail('public_comment', t.projectId, t.id, {
			body: result.body,
			authorName: result.authorName ?? '–'
		});
	}
	return result;
}

export function deleteComment(ref: string | number, commentId: number, actorId: string) {
	const t = resolveTicket(ref);
	requireProjectAccess(actorId, t.projectId, 'member');
	const comment = db
		.select({ id: ticketComment.id })
		.from(ticketComment)
		.where(and(eq(ticketComment.id, commentId), eq(ticketComment.ticketId, t.id)))
		.get();
	if (!comment) throw new ApiError(404, 'Kommentar nicht gefunden.');
	db.delete(ticketComment).where(eq(ticketComment.id, comment.id)).run();
	publish(t.projectId, { ticket: `${getProject(t.projectId).key}-${t.number}` });
}

/** Anzahl offener Voraussetzungen (depends_on auf nicht erledigte Tickets) je Ticket */
function openBlockerCounts(ids: number[]) {
	if (!ids.length) return new Map<number, number>();
	const rows = db
		.select({ sourceId: ticketLink.sourceId, count: sql<number>`count(*)` })
		.from(ticketLink)
		.innerJoin(ticket, eq(ticket.id, ticketLink.targetId))
		.where(and(eq(ticketLink.type, 'depends_on'), inArray(ticketLink.sourceId, ids), isNull(ticket.closedAt)))
		.groupBy(ticketLink.sourceId)
		.all();
	return new Map(rows.map((r) => [r.sourceId, Number(r.count)]));
}

/** Detailansicht: Ticket mit Projekt, Unteraufgaben, übergeordnetem Ticket und Verknüpfungen */
export function getTicketDetail(ref: string | number, actorId?: string) {
	let t = resolveTicket(ref);
	advanceStartedVersions(t.projectId);
	t = resolveTicket(t.id);
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

	const subtaskRows = db.select().from(ticket).where(eq(ticket.parentId, t.id)).orderBy(asc(ticket.number)).all();
	const parent = t.parentId ? db.select().from(ticket).where(eq(ticket.id, t.parentId)).get() : null;
	const blockers = openBlockerCounts(subtaskRows.map((s) => s.id));
	const people = assigneesByTicket([t.id, ...subtaskRows.map((s) => s.id), ...(parent ? [parent.id] : [])]);
	const tags = tagsByTicket([t.id, ...subtaskRows.map((s) => s.id)]);
	const subtasks = subtaskRows.map((s) => ({
		...present(s, p.key, colMap.get(s.columnId), people.get(s.id)),
		tags: tags.get(s.id) ?? [],
		openBlockers: blockers.get(s.id) ?? 0
	}));

	const assignees = people.get(t.id) ?? [];

	return {
		ticket: {
			...present(t, p.key, colMap.get(t.columnId), assignees),
			tags: tags.get(t.id) ?? []
		},
		project: p,
		columns: cols,
		parent: parent ? present(parent, p.key, colMap.get(parent.columnId), people.get(parent.id)) : null,
		subtasks,
		links,
		attachments: listAttachments(t.id),
		comments: commentsForTicket(t.id),
		assignee: assignees[0] ?? null,
		assignees,
		submission:
			t.intakeFormId !== null || t.reporterEmail !== null
				? {
						form: t.intakeFormId
							? (db.select({ name: intakeForm.name }).from(intakeForm).where(eq(intakeForm.id, t.intakeFormId)).get()
									?.name ?? null)
							: null,
						email: t.reporterEmail,
						system: t.systemName
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

function checkParent(tx: Tx, t: { id?: number; projectId: number; kind: 'version' | 'main' | 'task' }, parentRef: unknown) {
	if (parentRef === null || parentRef === undefined || parentRef === '') return null;
	const parent = resolveTicket(String(parentRef), tx);
	if (parent.projectId !== t.projectId)
		throw new ApiError(400, 'Unteraufgaben müssen im selben Projekt liegen wie die übergeordnete Aufgabe.');
	// Zyklen verhindern: das neue Elternticket darf kein Nachfahre dieses Tickets sein
	for (let cur: Ticket | undefined = parent; cur;) {
		if (cur.id === t.id) throw new ApiError(400, 'Eine Aufgabe kann nicht Unteraufgabe von sich selbst sein.');
		cur = cur.parentId ? tx.select().from(ticket).where(eq(ticket.id, cur.parentId)).get() : undefined;
	}
	if (t.kind === 'version' || (t.kind === 'main' && parent.kind !== 'version') || (t.kind === 'task' && parent.kind !== 'main' && parent.kind !== 'task'))
		throw new ApiError(400, 'Versionen stehen oben; Hauptaufgaben gehören zu Versionen und Tasks zu Hauptaufgaben oder Tasks.');
	return parent.id;
}

function checkDates(start: string | null, due: string | null) {
	if (start && due && start > due) throw new ApiError(400, 'Startdatum liegt nach dem Fälligkeitsdatum.');
}

const DAY = 86_400_000;
const toDay = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
const fromDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const shiftDate = (date: string | null, days: number) => (date ? fromDay(toDay(date) + days) : null);

/** Verschiebt alle Unterelemente zusammen mit ihrem Elternticket. */
function shiftDescendants(tx: Tx, parent: Ticket, days: number) {
	if (!days) return;
	const rows = tx.select().from(ticket).where(eq(ticket.projectId, parent.projectId)).all();
	let parentIds = new Set([parent.id]);
	while (parentIds.size) {
		const children = rows.filter((row) => row.parentId !== null && parentIds.has(row.parentId));
		for (const child of children) {
			tx.update(ticket)
				.set({ startDate: shiftDate(child.startDate, days), dueDate: shiftDate(child.dueDate, days) })
				.where(eq(ticket.id, child.id))
				.run();
		}
		parentIds = new Set(children.map((child) => child.id));
	}
}

/** Passt eine Version an die Zeitspanne ihrer Hauptaufgaben an. */
function syncVersion(tx: Tx, versionId: number, exact: boolean) {
	const version = tx.select().from(ticket).where(eq(ticket.id, versionId)).get();
	if (!version || version.kind !== 'version') return;
	const dates = tx
		.select({ startDate: ticket.startDate, dueDate: ticket.dueDate })
		.from(ticket)
		.where(and(eq(ticket.parentId, version.id), eq(ticket.kind, 'main')))
		.all()
		.flatMap((child) => [child.startDate, child.dueDate])
		.filter((date): date is string => date !== null);
	if (!dates.length) return;
	const earliest = dates.reduce((first, date) => (date < first ? date : first));
	const latest = dates.reduce((last, date) => (date > last ? date : last));
	const startDate = exact || !version.startDate || earliest < version.startDate ? earliest : version.startDate;
	const dueDate = exact || !version.dueDate || latest > version.dueDate ? latest : version.dueDate;
	if (startDate !== version.startDate || dueDate !== version.dueDate)
		tx.update(ticket).set({ startDate, dueDate }).where(eq(ticket.id, version.id)).run();
}

/** Versionen folgen ihrer zeitlichen Reihenfolge und dürfen sich nicht überschneiden. */
function sequenceVersions(tx: Tx, projectId: number) {
	const versions = tx
		.select()
		.from(ticket)
		.where(and(eq(ticket.projectId, projectId), eq(ticket.kind, 'version')))
		.orderBy(asc(ticket.startDate), asc(ticket.number))
		.all();
	let previousEnd: number | null = null;
	for (const version of versions) {
		if (!version.startDate) continue;
		const start = toDay(version.startDate);
		const end = toDay(version.dueDate ?? version.startDate);
		const days = previousEnd !== null && start <= previousEnd ? previousEnd + 1 - start : 0;
		if (days) {
			tx.update(ticket)
				.set({ startDate: shiftDate(version.startDate, days), dueDate: shiftDate(version.dueDate, days) })
				.where(eq(ticket.id, version.id))
				.run();
			shiftDescendants(tx, version, days);
		}
		previousEnd = end + days;
	}
}

/** Benutzer per ID oder E-Mail finden */
function resolveUser(tx: Tx, ref: string) {
	const u = tx
		.select({ id: user.id, active: user.active })
		.from(user)
		.where(or(eq(user.id, ref), eq(user.email, ref)))
		.get();
	if (!u) throw new ApiError(400, `Benutzer "${ref}" nicht gefunden.`);
	return u;
}

/** Zuständige aus der Eingabe: Liste (assignees) oder eine Person (assigneeId/assignee); undefined = unverändert */
function assigneeInput(input: {
	assignees?: string[];
	assigneeId?: string | null;
	assignee?: string | null;
}): string[] | undefined {
	if (input.assignees !== undefined) return input.assignees;
	if (input.assigneeId === undefined && input.assignee === undefined) return undefined;
	const one = input.assigneeId ?? input.assignee;
	return one ? [one] : [];
}

/** Tasks ohne eigene Auswahl übernehmen die Zuständigen ihrer neu gesetzten Hauptaufgabe. */
function inheritedAssignees(tx: Tx, kind: Ticket['kind'], parentId: number | null) {
	if (kind !== 'task' || parentId === null) return undefined;
	const parent = tx.select({ kind: ticket.kind }).from(ticket).where(eq(ticket.id, parentId)).get();
	if (parent?.kind !== 'main') return undefined;
	return (assigneesByTicket([parentId], tx).get(parentId) ?? []).map((person) => person.id);
}

/**
 * Zuständige eines Tickets ersetzen. Neu hinzukommende Personen müssen aktive Projektmitglieder sein.
 * Mit `keepExisting` (Liste `assignees`) dürfen bereits Zuständige bleiben, auch wenn ihr Konto inzwischen
 * deaktiviert ist – sonst ließe sich neben ihnen niemand mehr hinzufügen.
 * Gibt die IDs der neu hinzugekommenen Personen zurück.
 */
function setAssignees(tx: Tx, ticketId: number, projectId: number, refs: string[], keepExisting: boolean) {
	const current = new Set(
		tx
			.select({ id: ticketAssignee.userId })
			.from(ticketAssignee)
			.where(eq(ticketAssignee.ticketId, ticketId))
			.all()
			.map((r) => r.id)
	);
	const ids: string[] = [];
	for (const ref of refs) {
		const u = resolveUser(tx, ref);
		if (ids.includes(u.id)) continue;
		if (!keepExisting || !current.has(u.id)) {
			const membership = tx
				.select()
				.from(projectMember)
				.where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, u.id)))
				.get();
			if (!u.active || !membership) throw new ApiError(400, 'Zuständige müssen aktive Projektmitglieder sein.');
		}
		ids.push(u.id);
	}
	tx.delete(ticketAssignee).where(eq(ticketAssignee.ticketId, ticketId)).run();
	ids.forEach((userId, position) => tx.insert(ticketAssignee).values({ ticketId, userId, position }).run());
	// Für ältere Versionen und Werkzeuge, die nur eine Person kennen
	tx.update(ticket)
		.set({ assigneeId: ids[0] ?? null })
		.where(eq(ticket.id, ticketId))
		.run();
	return ids.filter((id) => !current.has(id));
}

/** Herkunft eines Tickets aus einem Formular (nur intern, nicht über die API setzbar) */
export type TicketOrigin = {
	intakeFormId: number;
	reporterEmail: string | null;
	systemName?: string | null;
	deferCreatedEmail?: boolean;
};

export function createTicket(
	projectRef: string | number,
	rawInput: unknown,
	userId: string | null,
	origin?: TicketOrigin
) {
	const input = parseInput(createTicketSchema, rawInput);
	const p = getProject(projectRef);
	const cols = getColumns(p.id);
	const hasParent = [input.parentId, input.parent].some((parent) => parent !== undefined && parent !== null && parent !== '');
	const col =
		input.column !== undefined && input.column !== null
			? resolveColumn(p.id, input.column)
			: input.columnId !== undefined
				? resolveColumn(p.id, input.columnId)
				: (input.kind ?? 'task') === 'task' && !hasParent
					? (cols.find((c) => c.isBacklog) ?? cols.find((c) => !c.isDone) ?? cols[0])
					: (cols.find((c) => !c.isBacklog && !c.isDone) ?? cols.find((c) => !c.isDone) ?? cols[0]);
	if (!col) throw new ApiError(409, 'Projekt hat keine Spalten.');

	const title = str(input.title, 'title', { max: 300 });
	const startDate = optDate(input.startDate, 'startDate');
	const dueDate = optDate(input.dueDate, 'dueDate');
	checkDates(startDate, dueDate);

	const created = db.transaction((tx) => {
		const kind = input.kind ?? 'task';
		const parentId = checkParent(tx, { projectId: p.id, kind }, input.parentId ?? input.parent);
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
				kind,
				description: optStr(input.description, 'description') ?? '',
				priority: input.priority !== undefined ? oneOf(input.priority, PRIORITIES, 'priority') : 'medium',
				columnId: col.id,
				position: nextPosition(tx, col.id),
				parentId,
				startDate,
				dueDate,
				closedAt: col.isDone ? new Date() : null,
				createdById: userId,
				intakeFormId: origin?.intakeFormId ?? null,
				reporterEmail: origin?.reporterEmail ?? null,
				systemName: origin?.systemName ?? null
			})
			.returning()
			.get();
		if (t.kind === 'main' && t.parentId) syncVersion(tx, t.parentId, true);
		sequenceVersions(tx, t.projectId);

		const dependsOn = input.dependsOn ?? [];
		if (!Array.isArray(dependsOn)) throw new ApiError(400, 'Feld "dependsOn" muss eine Liste sein.');
		for (const ref of dependsOn) insertLink(tx, t, String(ref), 'depends_on', userId);

		const relatesTo = input.relatesTo ?? [];
		if (!Array.isArray(relatesTo)) throw new ApiError(400, 'Feld "relatesTo" muss eine Liste sein.');
		for (const ref of relatesTo) insertLink(tx, t, String(ref), 'relates', userId);

		if (input.tags !== undefined) setTicketTags(tx, t.id, p.id, input.tags);
		const added = setAssignees(
			tx,
			t.id,
			p.id,
			assigneeInput(input) ?? inheritedAssignees(tx, t.kind, t.parentId) ?? [],
			false
		);

		return { ...t, added };
	});
	const result = getTicket(created.id);
	publish(p.id, { ticket: result.key });
	notifyTicket('created', p.id, created.id);
	if (!origin?.deferCreatedEmail) notifyEmail('created', p.id, created.id);
	if (created.added.length) notifyTicket('assigned', p.id, created.id);
	return result;
}

export function updateTicket(ref: string | number, rawInput: unknown) {
	const input = parseInput(updateTicketSchema, rawInput);
	const t = resolveTicket(ref);
	const added = db.transaction((tx) => {
		const patch: Partial<typeof ticket.$inferInsert> = {};
		if (input.title !== undefined) patch.title = str(input.title, 'title', { max: 300 });
		if (input.description !== undefined) patch.description = optStr(input.description, 'description') ?? '';
		if (input.priority !== undefined) patch.priority = oneOf(input.priority, PRIORITIES, 'priority');
		if (input.boardGroup !== undefined) {
			if ((input.kind ?? t.kind) !== 'task') throw new ApiError(400, 'Board-Gruppen gelten nur für Aufgaben.');
			patch.boardGroup = input.boardGroup;
		}
		if (input.kind !== undefined) {
			const children = tx.select({ id: ticket.id }).from(ticket).where(eq(ticket.parentId, t.id)).get();
			if (children && input.kind !== t.kind) throw new ApiError(400, 'Elemente mit Unterelementen können ihren Typ nicht ändern.');
			patch.kind = input.kind;
		}
		if (input.startDate !== undefined) patch.startDate = optDate(input.startDate, 'startDate');
		if (input.dueDate !== undefined) patch.dueDate = optDate(input.dueDate, 'dueDate');
		if (input.parentId !== undefined || input.parent !== undefined || input.kind !== undefined)
			patch.parentId = checkParent(tx, { ...t, kind: patch.kind ?? t.kind }, input.parentId !== undefined || input.parent !== undefined ? input.parentId ?? input.parent : t.parentId);
		checkDates(
			patch.startDate !== undefined ? patch.startDate : t.startDate,
			patch.dueDate !== undefined ? patch.dueDate : t.dueDate
		);
		const updated = { ...t, ...patch };
		if (Object.keys(patch).length) {
			tx.update(ticket).set(patch).where(eq(ticket.id, t.id)).run();
			if (t.startDate && updated.startDate) {
				const oldEnd = toDay(t.dueDate ?? t.startDate);
				const newEnd = toDay(updated.dueDate ?? updated.startDate);
				const days = toDay(updated.startDate) - toDay(t.startDate);
				if (days && newEnd - toDay(updated.startDate) === oldEnd - toDay(t.startDate))
					shiftDescendants(tx, t, days);
			}
		}
		if (t.kind === 'main' && t.parentId && t.parentId !== updated.parentId) syncVersion(tx, t.parentId, true);
		if (updated.kind === 'main' && updated.parentId) syncVersion(tx, updated.parentId, true);
		if (updated.kind === 'version') syncVersion(tx, updated.id, false);
		sequenceVersions(tx, t.projectId);
		if (input.tags !== undefined) {
			setTicketTags(tx, t.id, t.projectId, input.tags);
			if (!Object.keys(patch).length) tx.update(ticket).set({ updatedAt: new Date() }).where(eq(ticket.id, t.id)).run();
		}
		const people =
			assigneeInput(input) ??
			(input.parentId !== undefined || input.parent !== undefined
				? inheritedAssignees(tx, updated.kind, updated.parentId)
				: undefined);
		const added =
			people !== undefined ? setAssignees(tx, t.id, t.projectId, people, input.assignees !== undefined) : [];

		const colRef = input.column ?? input.columnId;
		if (colRef !== undefined || input.position !== undefined) {
			const col = colRef !== undefined ? resolveColumn(t.projectId, colRef) : resolveColumn(t.projectId, t.columnId);
			moveTicket(tx, t, col, optInt(input.position, 'position'));
		}
		return added;
	});
	const result = getTicket(t.id);
	publish(t.projectId, { ticket: result.key });
	notifyChanges(t, resolveTicket(t.id));
	if (added.length) notifyTicket('assigned', t.projectId, t.id);
	return result;
}

/** Benachrichtigung, wenn ein Ticket erledigt wurde (Vergleich vorher/nachher) */
function notifyChanges(before: Ticket, after: Ticket) {
	if (before.closedAt === null && after.closedAt !== null) {
		notifyTicket('closed', after.projectId, after.id);
		notifyEmail('closed', after.projectId, after.id);
	}
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

/**
 * Manuelle Reihenfolge einer Spalte festlegen (z. B. aus einer sortierten Ansicht übernommen).
 * Die genannten Tickets kommen in dieser Reihenfolge nach oben, alle übrigen Tickets der Spalte
 * behalten ihre bisherige Reihenfolge dahinter.
 */
export function reorderTickets(projectRef: string | number, rawInput: unknown) {
	const input = parseInput(reorderTicketsSchema, rawInput);
	const p = getProject(projectRef);
	const col = resolveColumn(p.id, input.column);
	const order = db.transaction((tx) => {
		const current = tx
			.select({ id: ticket.id })
			.from(ticket)
			.where(eq(ticket.columnId, col.id))
			.orderBy(asc(ticket.position), asc(ticket.number))
			.all()
			.map((r) => r.id);
		const inColumn = new Set(current);
		const foreign = input.tickets.find((id) => !inColumn.has(id));
		if (foreign !== undefined) throw new ApiError(400, `Aufgabe ${foreign} liegt nicht in dieser Spalte.`);
		const listed = new Set(input.tickets);
		const next = [...input.tickets, ...current.filter((id) => !listed.has(id))];
		next.forEach((id, i) => tx.update(ticket).set({ position: i }).where(eq(ticket.id, id)).run());
		return next;
	});
	publish(p.id);
	return { columnId: col.id, tickets: order };
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
	if (target.id === source.id) throw new ApiError(400, 'Eine Aufgabe kann nicht mit sich selbst verknüpft werden.');
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

export function removeLink(ref: string | number, linkId: number, actorId: string) {
	const t = resolveTicket(ref);
	requireProjectAccess(actorId, t.projectId, 'member');
	const link = db
		.select()
		.from(ticketLink)
		.where(and(eq(ticketLink.id, linkId), or(eq(ticketLink.sourceId, t.id), eq(ticketLink.targetId, t.id))))
		.get();
	if (!link) throw new ApiError(404, 'Verknüpfung nicht gefunden.');
	const other = resolveTicket(link.sourceId === t.id ? link.targetId : link.sourceId);
	requireProjectAccess(actorId, other.projectId, 'member');
	const res = db
		.delete(ticketLink)
		.where(and(eq(ticketLink.id, linkId), or(eq(ticketLink.sourceId, t.id), eq(ticketLink.targetId, t.id))))
		.run();
	if (res.changes === 0) throw new ApiError(404, 'Verknüpfung nicht gefunden.');
	publish(t.projectId);
}

/** Alle Abhängigkeiten innerhalb eines Projekts (für die Pfeile im Gantt-Chart) */
export function listDependencies(projectId: number, actorId: string) {
	requireProjectAccess(actorId, projectId);
	const src = alias(ticket, 'src');
	const target = alias(ticket, 'dependency_target');
	const accessibleProjects = listProjects(actorId).map((p) => p.id);
	return db
		.select({ id: ticketLink.id, sourceId: ticketLink.sourceId, targetId: ticketLink.targetId })
		.from(ticketLink)
		.innerJoin(src, eq(src.id, ticketLink.sourceId))
		.innerJoin(target, eq(target.id, ticketLink.targetId))
		.where(
			and(
				eq(src.projectId, projectId),
				eq(ticketLink.type, 'depends_on'),
				inArray(target.projectId, accessibleProjects)
			)
		)
		.all();
}
