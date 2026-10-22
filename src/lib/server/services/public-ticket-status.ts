import { createHmac, timingSafeEqual } from 'node:crypto';
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { and, asc, eq } from 'drizzle-orm';
import { publicCommentInputSchema, publicTicketStatusSchema } from '#lib/contracts/index.js';
import { db } from '../db/index.js';
import {
	boardColumn,
	project,
	tag,
	ticket,
	ticketAssignee,
	ticketComment,
	ticketTag,
	user
} from '../db/schema.js';
import { ApiError } from '../errors.js';
import { publish } from '../live.js';
import { parseInput } from '../validation.js';

const accessTokenFor = (row: Pick<typeof ticket.$inferSelect, 'id' | 'createdAt'>) =>
	createHmac('sha256', BETTER_AUTH_SECRET).update(`ticket-status:v1:${row.id}:${row.createdAt.getTime()}`).digest('base64url');

export function publicTicketStatusUrlToken(ticketId: number) {
	const row = db.select().from(ticket).where(eq(ticket.id, ticketId)).get();
	return row ? accessTokenFor(row) : null;
}

export function publicTicketStatusPath(ticketId: number, key: string) {
	const tokenValue = publicTicketStatusUrlToken(ticketId);
	return tokenValue ? `/status/${key}/${tokenValue}` : null;
}

function authorizedTicket(ref: string, tokenValue: string) {
	const match = ref.trim().match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
	const row = match
		? db
				.select({ ticket })
				.from(ticket)
				.innerJoin(project, eq(project.id, ticket.projectId))
				.where(and(eq(project.key, match[1].toUpperCase()), eq(ticket.number, Number(match[2]))))
				.get()?.ticket
		: undefined;
	if (!row) throw new ApiError(404, 'Status-Link ist ungültig.');
	if (!/^[A-Za-z0-9_-]{43}$/.test(tokenValue)) throw new ApiError(404, 'Status-Link ist ungültig.');
	const expected = Buffer.from(accessTokenFor(row));
	const provided = Buffer.from(tokenValue);
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
		throw new ApiError(404, 'Status-Link ist ungültig.');
	return row;
}

function present(ref: string, tokenValue: string) {
	const row = authorizedTicket(ref, tokenValue);
	const details = db
		.select({
			key: project.key,
			projectName: project.name,
			projectColor: project.color,
			status: boardColumn.name,
			createdBy: user.name
		})
		.from(ticket)
		.innerJoin(project, eq(project.id, ticket.projectId))
		.innerJoin(boardColumn, eq(boardColumn.id, ticket.columnId))
		.leftJoin(user, eq(user.id, ticket.createdById))
		.where(eq(ticket.id, row.id))
		.get()!;
	const assignees = db
		.select({ name: user.name })
		.from(ticketAssignee)
		.innerJoin(user, eq(user.id, ticketAssignee.userId))
		.where(eq(ticketAssignee.ticketId, row.id))
		.orderBy(asc(ticketAssignee.position))
		.all()
		.map(({ name }) => name);
	const tags = db
		.select({ name: tag.name, color: tag.color })
		.from(ticketTag)
		.innerJoin(tag, eq(tag.id, ticketTag.tagId))
		.where(eq(ticketTag.ticketId, row.id))
		.orderBy(asc(tag.name))
		.all();
	const comments = db
		.select({
			id: ticketComment.id,
			body: ticketComment.body,
			authorName: user.name,
			authorId: ticketComment.authorId,
			createdAt: ticketComment.createdAt
		})
		.from(ticketComment)
		.leftJoin(user, eq(user.id, ticketComment.authorId))
		.where(and(eq(ticketComment.ticketId, row.id), eq(ticketComment.internal, false)))
		.orderBy(asc(ticketComment.createdAt), asc(ticketComment.id))
		.all();
	const latestComment = comments.at(-1)?.createdAt;
	const updatedAt = latestComment && latestComment > row.updatedAt ? latestComment : row.updatedAt;
	return publicTicketStatusSchema.parse({
		key: `${details.key}-${row.number}`,
		title: row.title,
		description: row.description,
		system: row.systemName,
		status: details.status,
		closed: row.closedAt !== null,
		createdAt: row.createdAt,
		updatedAt,
		createdBy: details.createdBy,
		assignees,
		tags,
		project: { name: details.projectName, color: details.projectColor },
		comments: comments.map(({ authorId, ...comment }) => ({ ...comment, isReporter: authorId === null }))
	});
}

export function getPublicTicketStatus(ref: string, tokenValue: string) {
	return present(ref, tokenValue);
}

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000;
const recentComments = new Map<string, number[]>();

function checkRateLimit(key: string, now = Date.now()) {
	const hits = (recentComments.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
	if (hits.length >= RATE_LIMIT) throw new ApiError(429, 'Zu viele Kommentare. Bitte später erneut versuchen.');
	recentComments.set(key, [...hits, now]);
	if (recentComments.size > 10_000) recentComments.clear();
}

export function addPublicTicketComment(ref: string, tokenValue: string, rawInput: unknown, ip: string) {
	const row = authorizedTicket(ref, tokenValue);
	const input = parseInput(publicCommentInputSchema, rawInput);
	checkRateLimit(`${row.id}:${ip}`);
	db.insert(ticketComment).values({ ticketId: row.id, authorId: null, body: input.body, internal: false }).run();
	publish(row.projectId, { ticket: ref });
	return present(ref, tokenValue);
}
