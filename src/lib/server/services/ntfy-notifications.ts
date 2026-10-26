import { and, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
	NTFY_NOTIFICATION_EVENTS,
	ntfyNotificationsDtoSchema,
	updateNtfyNotificationsSchema,
	type NtfyNotificationEvent,
	type NtfyNotificationsDto
} from '#lib/contracts/index.js';
import { BASE_PATH } from '#lib/paths.js';
import { BETTER_AUTH_URL } from '$app/env/private';
import { db } from '../db';
import { boardColumn, project, projectMember, ticket, userNtfyNotification } from '../db/schema';
import { parseInput } from '../validation';

const topicOf = (userId: string) =>
	db.select().from(userNtfyNotification).where(eq(userNtfyNotification.userId, userId)).get();

function generatedTopic() {
	return `kenny-${randomBytes(24).toString('hex')}`;
}

function ensureTopic(userId: string) {
	const existing = topicOf(userId);
	if (existing) return existing;
	const values = { userId, topic: generatedTopic(), events: [...NTFY_NOTIFICATION_EVENTS] };
	db.insert(userNtfyNotification).values(values).run();
	return topicOf(userId)!;
}

export function getNtfyNotifications(userId: string): NtfyNotificationsDto {
	const row = ensureTopic(userId);
	return ntfyNotificationsDtoSchema.parse({
		configured: true,
		topic: row.topic,
		events: row.events.filter((event) => NTFY_NOTIFICATION_EVENTS.includes(event))
	});
}

export function updateNtfyNotifications(userId: string, rawInput: unknown): NtfyNotificationsDto {
	const input = parseInput(updateNtfyNotificationsSchema, rawInput);
	const current = ensureTopic(userId);
	const values = {
		events: input.events ? NTFY_NOTIFICATION_EVENTS.filter((event) => input.events!.includes(event)) : current.events
	};
	db.update(userNtfyNotification).set(values).where(eq(userNtfyNotification.userId, userId)).run();
	return getNtfyNotifications(userId);
}

const origin = () => (BETTER_AUTH_URL ?? '').replace(/\/+$/, '') + BASE_PATH;

const eventTitle: Record<NtfyNotificationEvent, string> = {
	ticket_created: 'Neues Ticket',
	ticket_assigned: 'Ticket zugewiesen',
	creator_commented_unassigned: 'Ticket kommentiert',
	assigned_ticket_commented: 'Neuer Kommentar',
	due_today: 'Heute fällig',
	overdue: 'Ticket überfällig',
	assigned_ticket_status_changed: 'Statusupdate',
	ticket_unassigned: 'Ticket entzogen'
};

function recipients(projectId: number, event: NtfyNotificationEvent, userIds?: string[]) {
	const conditions = [eq(projectMember.projectId, projectId)];
	if (userIds !== undefined) {
		if (!userIds.length) return [];
		conditions.push(inArray(userNtfyNotification.userId, userIds));
	}
	return db
		.select({ topic: userNtfyNotification.topic, events: userNtfyNotification.events })
		.from(userNtfyNotification)
		.innerJoin(projectMember, eq(projectMember.userId, userNtfyNotification.userId))
		.where(and(...conditions))
		.all()
		.filter((row) => row.events.includes(event));
}

/** Zustellt an ntfy.sh. Themen sind absichtlich kein Geheimnis und werden nur dem jeweiligen Benutzer gezeigt. */
export function notifyNtfy(event: NtfyNotificationEvent, ticketId: number, userIds?: string[]) {
	const row = db
		.select({
			projectId: ticket.projectId,
			number: ticket.number,
			title: ticket.title,
			key: project.key,
			status: boardColumn.name
		})
		.from(ticket)
		.innerJoin(project, eq(project.id, ticket.projectId))
		.innerJoin(boardColumn, eq(boardColumn.id, ticket.columnId))
		.where(eq(ticket.id, ticketId))
		.get();
	if (!row) return;
	for (const recipient of recipients(row.projectId, event, userIds)) {
		void fetch(`https://ntfy.sh/${encodeURIComponent(recipient.topic)}`, {
			method: 'POST',
			headers: {
				title: event === 'assigned_ticket_status_changed' ? `${eventTitle[event]}: ${row.status}` : eventTitle[event],
				click: `${origin()}/tickets/${row.key}-${row.number}`,
				tags: 'clipboard'
			},
			body: `${row.key}-${row.number}: ${row.title}`,
			signal: AbortSignal.timeout(10_000)
		}).catch((error) => console.error(`ntfy-Benachrichtigung fehlgeschlagen: ${String(error)}`));
	}
}

/** Fälligkeit wird bei Anlage oder einer Änderung gemeldet; ein täglicher Erinnerungsjob kann dies später ergänzen. */
export function notifyNtfyDue(ticketId: number, dueDate: string | null, userIds: string[]) {
	if (!dueDate) return;
	const today = new Date().toISOString().slice(0, 10);
	if (dueDate === today) notifyNtfy('due_today', ticketId, userIds);
	if (dueDate < today) notifyNtfy('overdue', ticketId, userIds);
}
