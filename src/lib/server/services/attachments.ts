import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '../db';
import { attachment, ticket, user, type Attachment } from '../db/schema';
import { ApiError } from '../errors';
import { publish } from '../live';
import { resolveTicket } from './tickets';

const DIR = env.ATTACHMENTS_DIR || 'data/attachments';
/** Maximale Größe pro Datei in MB */
const MAX_MB = Number(env.ATTACHMENT_MAX_MB) || 25;

/** Bildformate, die direkt im Browser angezeigt werden dürfen (kein SVG: könnte Skripte enthalten) */
const INLINE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

const path = (key: string) => join(DIR, key);

function present(a: Attachment, uploadedBy: string | null = null) {
	return {
		id: a.id,
		ticketId: a.ticketId,
		filename: a.filename,
		mimeType: a.mimeType,
		size: a.size,
		isImage: INLINE_TYPES.includes(a.mimeType),
		url: `/api/v1/attachments/${a.id}`,
		uploadedBy,
		createdAt: a.createdAt
	};
}
export type { AttachmentDto } from '$lib/contracts';
import type { AttachmentDto } from '$lib/contracts';

export function listAttachments(ticketId: number): AttachmentDto[] {
	return db
		.select({ a: attachment, uploadedBy: user.name })
		.from(attachment)
		.leftJoin(user, eq(user.id, attachment.uploadedById))
		.where(eq(attachment.ticketId, ticketId))
		.orderBy(asc(attachment.createdAt), asc(attachment.id))
		.all()
		.map((r) => present(r.a, r.uploadedBy));
}

/** Anzahl der Anhänge je Ticket eines Projekts */
export function countAttachments(projectId: number) {
	const rows = db
		.select({ ticketId: attachment.ticketId, n: sql<number>`count(*)` })
		.from(attachment)
		.innerJoin(ticket, eq(ticket.id, attachment.ticketId))
		.where(eq(ticket.projectId, projectId))
		.groupBy(attachment.ticketId)
		.all();
	return new Map(rows.map((r) => [r.ticketId, r.n]));
}

/** Dateinamen säubern: keine Pfade, keine Steuerzeichen */
function cleanName(name: string) {
	const base = [...name.split(/[\\/]/).pop()!]
		.filter((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127 && char !== '"')
		.join('')
		.trim();
	return base.slice(0, 200) || 'datei';
}

export async function addAttachments(ref: string | number, files: File[], userId: string | null) {
	const t = resolveTicket(ref);
	if (!files.length) throw new ApiError(400, 'Keine Datei übergeben (Feld "file", multipart/form-data).');
	for (const f of files) {
		if (f.size > MAX_MB * 1024 * 1024) throw new ApiError(413, `"${f.name}" ist größer als ${MAX_MB} MB.`);
	}
	mkdirSync(DIR, { recursive: true });
	const uploadedBy = userId
		? (db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get()?.name ?? null)
		: null;

	const created: AttachmentDto[] = [];
	for (const f of files) {
		const storageKey = randomUUID();
		await writeFile(path(storageKey), Buffer.from(await f.arrayBuffer()));
		try {
			const row = db
				.insert(attachment)
				.values({
					ticketId: t.id,
					filename: cleanName(f.name),
					mimeType: f.type || 'application/octet-stream',
					size: f.size,
					storageKey,
					uploadedById: userId
				})
				.returning()
				.get();
			created.push(present(row, uploadedBy));
		} catch (e) {
			await rm(path(storageKey), { force: true });
			throw e;
		}
	}
	db.update(ticket).set({ updatedAt: new Date() }).where(eq(ticket.id, t.id)).run();
	publish(t.projectId);
	return created;
}

function getAttachment(id: number) {
	const a = Number.isInteger(id) ? db.select().from(attachment).where(eq(attachment.id, id)).get() : undefined;
	if (!a) throw new ApiError(404, 'Anhang nicht gefunden.');
	return a;
}

/** Datei ausliefern; Bilder inline, alles andere als Download */
export async function downloadAttachment(id: number, forceDownload = false) {
	const a = getAttachment(id);
	let data: Buffer;
	try {
		data = await readFile(path(a.storageKey));
	} catch {
		throw new ApiError(404, 'Datei fehlt auf dem Server.');
	}
	const inline = !forceDownload && INLINE_TYPES.includes(a.mimeType);
	const encoded = encodeURIComponent(a.filename);
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': inline ? a.mimeType : 'application/octet-stream',
			'content-length': String(data.length),
			'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox",
			'cache-control': 'private, no-store'
		}
	});
}

export async function deleteAttachment(id: number) {
	const a = getAttachment(id);
	const owner = db.select({ projectId: ticket.projectId }).from(ticket).where(eq(ticket.id, a.ticketId)).get();
	db.delete(attachment).where(eq(attachment.id, a.id)).run();
	if (owner) publish(owner.projectId);
	await rm(path(a.storageKey), { force: true });
}

/**
 * Speicherschlüssel aller Anhänge der Tickets (inkl. aller Unteraufgaben).
 * Vor dem Löschen aufrufen, weil die Datenbank die Zeilen per Cascade mitlöscht.
 */
export function storageKeysForTickets(ticketIds: number[]) {
	const all = new Set(ticketIds);
	for (let level = ticketIds; level.length;) {
		level = db
			.select({ id: ticket.id })
			.from(ticket)
			.where(inArray(ticket.parentId, level))
			.all()
			.map((r) => r.id)
			.filter((id) => !all.has(id));
		level.forEach((id) => all.add(id));
	}
	if (!all.size) return [];
	return db
		.select({ key: attachment.storageKey })
		.from(attachment)
		.where(inArray(attachment.ticketId, [...all]))
		.all()
		.map((r) => r.key);
}

export function storageKeysForProject(projectId: number) {
	return db
		.select({ key: attachment.storageKey })
		.from(attachment)
		.innerJoin(ticket, eq(ticket.id, attachment.ticketId))
		.where(eq(ticket.projectId, projectId))
		.all()
		.map((r) => r.key);
}

export async function removeFiles(keys: string[]) {
	await Promise.all(keys.map((k) => rm(path(k), { force: true })));
}
