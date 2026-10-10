// Teams-Benachrichtigungen: Ereignisse eines Projekts als Adaptive Card an einen Teams-Workflow senden.
// Kenny sendet nur ausgehend; der Workflow („Bei Empfang einer Webhookanforderung in einem Kanal posten“)
// stellt die Karte im Kanal zu. Funktioniert damit auch auf Servern im Firmennetz.
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import {
	NOTIFICATION_EVENTS,
	isAllowedWebhookUrl,
	notificationsDtoSchema,
	updateNotificationsSchema,
	type NotificationEvent,
	type NotificationsDto,
	type Priority
} from '$lib/contracts';
import { m } from '$lib/paraglide/messages.js';
import { db } from '../db';
import { intakeForm, project, projectNotification, ticket, user } from '../db/schema';
import { ApiError } from '../errors';
import { parseInput } from '../validation';
import { requireProjectAccess } from './access';
import { getProject } from './projects';

type Locale = 'de' | 'en';
type Row = typeof projectNotification.$inferSelect;

/** Einrichtung lesen und ändern dürfen nur Projektadministratoren (die URL ist ein Geheimnis) */
function requireAdminOf(projectRef: string | number, userId: string) {
	const p = getProject(projectRef);
	requireProjectAccess(userId, p.id, 'admin');
	return p;
}

const rowOf = (projectId: number) =>
	db.select().from(projectNotification).where(eq(projectNotification.projectId, projectId)).get();

function present(row: Row | undefined): NotificationsDto {
	return notificationsDtoSchema.parse({
		configured: !!row,
		webhookHost: row ? new URL(row.webhookUrl).hostname : null,
		events: row?.events ?? [...NOTIFICATION_EVENTS],
		locale: row?.locale ?? 'de',
		lastSentAt: row?.lastSentAt ?? null,
		lastError: row?.lastError ?? null
	});
}

export function getNotifications(projectRef: string | number, userId: string) {
	return present(rowOf(requireAdminOf(projectRef, userId).id));
}

/** Fehlende Felder bleiben unverändert; webhookUrl null entfernt die Einrichtung */
export function updateNotifications(projectRef: string | number, rawInput: unknown, userId: string) {
	const input = parseInput(updateNotificationsSchema, rawInput);
	const p = requireAdminOf(projectRef, userId);
	if (input.webhookUrl === null) {
		db.delete(projectNotification).where(eq(projectNotification.projectId, p.id)).run();
		return present(undefined);
	}
	const current = rowOf(p.id);
	const webhookUrl = input.webhookUrl ?? current?.webhookUrl;
	if (!webhookUrl) throw new ApiError(400, 'Bitte die Webhook-Adresse eines Teams-Workflows angeben.');
	const values = {
		webhookUrl,
		events: input.events
			? NOTIFICATION_EVENTS.filter((e) => input.events!.includes(e))
			: (current?.events ?? [...NOTIFICATION_EVENTS]),
		locale: input.locale ?? current?.locale ?? 'de',
		// Neue Adresse: alter Fehler gehört nicht mehr dazu
		...(input.webhookUrl ? { lastError: null } : {})
	};
	db.insert(projectNotification)
		.values({ projectId: p.id, ...values })
		.onConflictDoUpdate({ target: projectNotification.projectId, set: values })
		.run();
	return present(rowOf(p.id));
}

// --- Karten ------------------------------------------------------------------------------------

/**
 * Text als TextRun: Adaptive Cards werten darin kein Markdown aus. Nutzertexte (z. B. Titel aus
 * öffentlichen Formularen) können so keine Links oder Formatierungen einschleusen.
 */
const run = (text: string, style: Record<string, unknown> = {}) => ({ type: 'TextRun', text, ...style });
const line = (...inlines: ReturnType<typeof run>[]) => ({ type: 'RichTextBlock', inlines });
const fact = (label: string, value: string) => line(run(`${label}: `, { weight: 'Bolder' }), run(value));

const baseUrl = () => (env.BETTER_AUTH_URL ?? '').replace(/\/+$/, '');

export function adaptiveCard(body: unknown[], action?: { title: string; url: string }) {
	return {
		type: 'message',
		attachments: [
			{
				contentType: 'application/vnd.microsoft.card.adaptive',
				contentUrl: null,
				content: {
					$schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
					type: 'AdaptiveCard',
					version: '1.4',
					body,
					...(action ? { actions: [{ type: 'Action.OpenUrl', ...action }] } : {})
				}
			}
		]
	};
}

const PRIORITY_MESSAGES = { low: m.low, medium: m.medium, high: m.high, urgent: m.urgent } satisfies Record<
	Priority,
	unknown
>;
const priorityLabel = (priority: Priority, locale: Locale) => PRIORITY_MESSAGES[priority]({}, { locale });

/** Karte zu einem Ticket-Ereignis; null, wenn das Ticket nicht mehr existiert */
export function ticketCard(event: NotificationEvent, ticketId: number, locale: Locale) {
	const row = db
		.select({
			number: ticket.number,
			title: ticket.title,
			priority: ticket.priority,
			dueDate: ticket.dueDate,
			key: project.key,
			project: project.name,
			assignee: user.name,
			form: intakeForm.name
		})
		.from(ticket)
		.innerJoin(project, eq(project.id, ticket.projectId))
		.leftJoin(user, eq(user.id, ticket.assigneeId))
		.leftJoin(intakeForm, eq(intakeForm.id, ticket.intakeFormId))
		.where(eq(ticket.id, ticketId))
		.get();
	if (!row) return null;
	const key = `${row.key}-${row.number}`;
	const heading = {
		created: () => m.notification_created({ key }, { locale }),
		closed: () => m.notification_closed({ key }, { locale }),
		assigned: () => m.notification_assigned({ key, name: row.assignee ?? '–' }, { locale })
	}[event]();
	const body = [
		line(run(heading, { weight: 'Bolder', size: 'Medium', color: event === 'closed' ? 'Good' : 'Default' })),
		line(run(row.title, { weight: 'Bolder' })),
		...(event === 'created' && row.form
			? [line(run(m.notification_via_form({ form: row.form }, { locale }), { isSubtle: true }))]
			: []),
		fact(m.project({}, { locale }), row.project),
		fact(m.priority_2({}, { locale }), priorityLabel(row.priority, locale)),
		fact(m.notification_assignee({}, { locale }), row.assignee ?? m.notification_unassigned({}, { locale })),
		...(row.dueDate ? [fact(m.due({}, { locale }), row.dueDate)] : [])
	];
	return adaptiveCard(body, { title: m.notification_open({}, { locale }), url: `${baseUrl()}/tickets/${key}` });
}

// --- Zustellung --------------------------------------------------------------------------------

const inFlight = new Set<Promise<void>>();

/** Laufende Zustellungen abwarten (für Tests und ein geordnetes Herunterfahren) */
export async function settleNotifications() {
	await Promise.allSettled([...inFlight]);
}

/** An den Workflow senden; Ergebnis und Fehler werden an der Einrichtung vermerkt */
async function deliver(row: Row, payload: unknown): Promise<void> {
	let error: string | null = null;
	try {
		// Auch beim Senden prüfen: eine Adresse aus älteren Daten darf nie ein anderes Ziel erreichen
		if (!isAllowedWebhookUrl(row.webhookUrl)) throw new Error('Webhook-Adresse ist nicht erlaubt.');
		const response = await fetch(row.webhookUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			redirect: 'error',
			signal: AbortSignal.timeout(10_000)
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
	} catch (e) {
		error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
		console.error(`Teams-Benachrichtigung für Projekt ${row.projectId} fehlgeschlagen: ${error}`);
	}
	db.update(projectNotification)
		.set(error ? { lastError: error } : { lastError: null, lastSentAt: new Date() })
		.where(eq(projectNotification.projectId, row.projectId))
		.run();
	if (error) throw new Error(error);
}

/** Ticket-Ereignis melden, ohne die Anfrage aufzuhalten; erst nach erfolgreichem Speichern aufrufen */
export function notifyTicket(event: NotificationEvent, projectId: number, ticketId: number) {
	const row = rowOf(projectId);
	if (!row?.events.includes(event)) return;
	const card = ticketCard(event, ticketId, row.locale);
	if (!card) return;
	const delivery = deliver(row, card).catch(() => {});
	inFlight.add(delivery);
	void delivery.finally(() => inFlight.delete(delivery));
}

/** Testnachricht aus den Einstellungen; Fehler gehen an die Oberfläche zurück */
export async function sendTestNotification(projectRef: string | number, userId: string) {
	const p = requireAdminOf(projectRef, userId);
	const row = rowOf(p.id);
	if (!row) throw new ApiError(409, 'Für dieses Projekt sind keine Benachrichtigungen eingerichtet.');
	const card = adaptiveCard(
		[
			line(run(m.notification_test_title({}, { locale: row.locale }), { weight: 'Bolder', size: 'Medium' })),
			line(run(m.notification_test_text({ project: p.name }, { locale: row.locale })))
		],
		{ title: m.notification_open({}, { locale: row.locale }), url: `${baseUrl()}/projects/${p.key}/board` }
	);
	try {
		await deliver(row, card);
	} catch (e) {
		throw new ApiError(502, `Testnachricht fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
	}
	return present(rowOf(p.id));
}
