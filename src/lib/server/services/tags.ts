import { createTagSchema, updateTagSchema } from '$lib/contracts';
import { parseInput } from '../validation';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { tag, ticketTag, type Tag } from '../db/schema';
import { ApiError } from '../errors';
import { getProject } from './projects';
import { optStr, str } from './validate';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const DEFAULT_TAGS = [
	{ name: 'Bug', color: '#ef4444' },
	{ name: 'Feature', color: '#3b82f6' },
	{ name: 'Story', color: '#22c55e' }
];

/** Farben für automatisch angelegte Tags, reihum vergeben */
const AUTO_COLORS = ['#a855f7', '#f97316', '#14b8a6', '#ec4899', '#eab308', '#0ea5e9', '#6366f1', '#292524'];

export type { TagDto } from '$lib/contracts';
import type { TagDto } from '$lib/contracts';
const presentTag = (t: Tag): TagDto => ({ id: t.id, name: t.name, color: t.color });

function checkColor(v: unknown) {
	const c = str(v, 'color');
	if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new ApiError(400, 'Feld "color" muss eine Farbe wie #3b82f6 sein.');
	return c.toLowerCase();
}

export function listTags(projectId: number): TagDto[] {
	return db.select().from(tag).where(eq(tag.projectId, projectId)).orderBy(asc(tag.name)).all().map(presentTag);
}

function findByName(tx: Tx | typeof db, projectId: number, name: string) {
	return tx
		.select()
		.from(tag)
		.where(and(eq(tag.projectId, projectId), sql`lower(${tag.name}) = lower(${name})`))
		.get();
}

function getTag(projectId: number, tagId: number) {
	const t = db
		.select()
		.from(tag)
		.where(and(eq(tag.id, tagId), eq(tag.projectId, projectId)))
		.get();
	if (!t) throw new ApiError(404, 'Tag nicht gefunden.');
	return t;
}

function insertTag(tx: Tx | typeof db, projectId: number, name: string, color?: string) {
	const count =
		tx
			.select({ n: sql<number>`count(*)` })
			.from(tag)
			.where(eq(tag.projectId, projectId))
			.get()?.n ?? 0;
	return tx
		.insert(tag)
		.values({ projectId, name, color: color ?? AUTO_COLORS[count % AUTO_COLORS.length] })
		.returning()
		.get();
}

export function createTag(projectRef: string | number, rawInput: unknown) {
	const input = parseInput(createTagSchema, rawInput);
	const p = getProject(projectRef);
	const name = str(input.name, 'name', { max: 40 });
	if (findByName(db, p.id, name)) throw new ApiError(409, `Tag "${name}" gibt es bereits.`);
	return presentTag(insertTag(db, p.id, name, input.color !== undefined ? checkColor(input.color) : undefined));
}

export function updateTag(projectRef: string | number, tagId: number, rawInput: unknown) {
	const input = parseInput(updateTagSchema, rawInput);
	const p = getProject(projectRef);
	const t = getTag(p.id, tagId);
	const patch: Partial<typeof tag.$inferInsert> = {};
	if (input.name !== undefined) {
		patch.name = str(input.name, 'name', { max: 40 });
		const other = findByName(db, p.id, patch.name);
		if (other && other.id !== t.id) throw new ApiError(409, `Tag "${patch.name}" gibt es bereits.`);
	}
	if (input.color !== undefined) patch.color = checkColor(input.color);
	if (Object.keys(patch).length) db.update(tag).set(patch).where(eq(tag.id, t.id)).run();
	return presentTag(getTag(p.id, t.id));
}

export function deleteTag(projectRef: string | number, tagId: number) {
	const p = getProject(projectRef);
	db.delete(tag)
		.where(eq(tag.id, getTag(p.id, tagId).id))
		.run();
}

export function insertDefaultTags(tx: Tx, projectId: number) {
	for (const t of DEFAULT_TAGS)
		tx.insert(tag)
			.values({ projectId, ...t })
			.run();
}

/** Tags mehrerer Tickets, nach Ticket-ID gruppiert */
export function tagsByTicket(ticketIds: number[]) {
	const out = new Map<number, TagDto[]>();
	if (!ticketIds.length) return out;
	const rows = db
		.select({ ticketId: ticketTag.ticketId, tag })
		.from(ticketTag)
		.innerJoin(tag, eq(tag.id, ticketTag.tagId))
		.where(inArray(ticketTag.ticketId, ticketIds))
		.orderBy(asc(tag.name))
		.all();
	for (const r of rows) {
		if (!out.has(r.ticketId)) out.set(r.ticketId, []);
		out.get(r.ticketId)!.push(presentTag(r.tag));
	}
	return out;
}

/**
 * Tags eines Tickets komplett ersetzen. Erlaubt sind IDs oder Namen;
 * unbekannte Namen werden als neue Tags im Projekt angelegt.
 */
export function setTicketTags(tx: Tx, ticketId: number, projectId: number, refs: unknown) {
	if (!Array.isArray(refs)) throw new ApiError(400, 'Feld "tags" muss eine Liste sein.');
	const ids = new Set<number>();
	for (const ref of refs) {
		if (typeof ref === 'number' || (typeof ref === 'string' && /^\d+$/.test(ref))) {
			const t = tx
				.select()
				.from(tag)
				.where(and(eq(tag.id, Number(ref)), eq(tag.projectId, projectId)))
				.get();
			if (!t) throw new ApiError(400, `Tag ${ref} gibt es in diesem Projekt nicht.`);
			ids.add(t.id);
		} else {
			const name = str(optStr(ref, 'tags') ?? '', 'tags', { max: 40 });
			ids.add((findByName(tx, projectId, name) ?? insertTag(tx, projectId, name)).id);
		}
	}
	tx.delete(ticketTag).where(eq(ticketTag.ticketId, ticketId)).run();
	for (const tagId of ids) tx.insert(ticketTag).values({ ticketId, tagId }).run();
}
