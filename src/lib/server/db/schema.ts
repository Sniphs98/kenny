import {
	sqliteTable,
	text,
	integer,
	index,
	uniqueIndex,
	primaryKey,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { user } from './auth-schema';

export * from './auth-schema';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const project = sqliteTable('project', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Kurzes Kürzel für Ticketnummern, z.B. "WEB" → WEB-12 */
	key: text('key').notNull().unique(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	color: text('color').notNull().default('#6366f1'),
	/** Zähler für fortlaufende Ticketnummern pro Projekt */
	ticketCounter: integer('ticket_counter').notNull().default(0),
	ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
});

/** Spalten des Kanban-Boards eines Projekts */
export const boardColumn = sqliteTable(
	'board_column',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		position: integer('position').notNull().default(0),
		/** Tickets in dieser Spalte gelten als abgeschlossen */
		isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
		/** Backlog: Tickets in dieser Spalte werden im Gantt standardmäßig ausgeblendet */
		isBacklog: integer('is_backlog', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [index('board_column_project_idx').on(t.projectId)]
);

export { PRIORITIES, type Priority } from '$lib/contracts';
import {
	PRIORITIES,
	LINK_TYPES,
	INTAKE_EMAIL_MODES,
	NOTIFICATION_LOCALES,
	type IntakeFields,
	type NotificationEvent
} from '$lib/contracts';

export const ticket = sqliteTable(
	'ticket',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		columnId: integer('column_id')
			.notNull()
			.references(() => boardColumn.id),
		position: integer('position').notNull().default(0),
		priority: text('priority', { enum: PRIORITIES }).notNull().default('medium'),
		/** Übergeordnetes Ticket, wenn dieses Ticket eine Unteraufgabe ist */
		parentId: integer('parent_id').references((): AnySQLiteColumn => ticket.id, { onDelete: 'cascade' }),
		assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
		/** Start und Ende als YYYY-MM-DD für das Gantt-Chart */
		startDate: text('start_date'),
		dueDate: text('due_date'),
		closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
		createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
		/** Herkunft, wenn das Ticket über ein Formular eingereicht wurde */
		intakeFormId: integer('intake_form_id').references((): AnySQLiteColumn => intakeForm.id, {
			onDelete: 'set null'
		}),
		/** E-Mail der einreichenden Person bei Formularen ohne Anmeldung */
		reporterEmail: text('reporter_email'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(now)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(t) => [
		uniqueIndex('ticket_project_number_idx').on(t.projectId, t.number),
		index('ticket_column_idx').on(t.columnId),
		index('ticket_parent_idx').on(t.parentId)
	]
);

/**
 * Verknüpfung zwischen zwei Tickets.
 * - depends_on: source setzt target voraus (target muss zuerst erledigt sein)
 * - relates: einfache Verlinkung
 */
export { LINK_TYPES, type LinkType } from '$lib/contracts';

export const ticketLink = sqliteTable(
	'ticket_link',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sourceId: integer('source_id')
			.notNull()
			.references(() => ticket.id, { onDelete: 'cascade' }),
		targetId: integer('target_id')
			.notNull()
			.references(() => ticket.id, { onDelete: 'cascade' }),
		type: text('type', { enum: LINK_TYPES }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
	},
	(t) => [
		uniqueIndex('ticket_link_unique_idx').on(t.sourceId, t.targetId, t.type),
		index('ticket_link_target_idx').on(t.targetId)
	]
);

/** Tags pro Projekt, z.B. "Bug", "Feature", "Story" */
export const tag = sqliteTable(
	'tag',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull().default('#6366f1')
	},
	(t) => [uniqueIndex('tag_project_name_idx').on(t.projectId, t.name)]
);

export const ticketTag = sqliteTable(
	'ticket_tag',
	{
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => ticket.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.ticketId, t.tagId] }), index('ticket_tag_tag_idx').on(t.tagId)]
);

/** Dateianhänge an Tickets; die Datei selbst liegt unter ATTACHMENTS_DIR/<storageKey> */
export const attachment = sqliteTable(
	'attachment',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => ticket.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull(),
		size: integer('size').notNull(),
		storageKey: text('storage_key').notNull().unique(),
		uploadedById: text('uploaded_by_id').references(() => user.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
	},
	(t) => [index('attachment_ticket_idx').on(t.ticketId)]
);

/** Persönliche API-Tokens für die REST-API. Gespeichert wird nur der SHA-256-Hash. */
export const apiToken = sqliteTable('api_token', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	tokenHash: text('token_hash').notNull().unique(),
	/** Erste Zeichen des Tokens zur Wiedererkennung in der Oberfläche */
	prefix: text('prefix').notNull(),
	lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
});

/** Formulare, über die Tickets per Link eingereicht werden (je nach Einstellung auch ohne Anmeldung) */
export const intakeForm = sqliteTable('intake_form', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	/** Zufälliger Teil des öffentlichen Links; neu erzeugen macht den alten Link ungültig */
	token: text('token').notNull().unique(),
	requireLogin: integer('require_login', { mode: 'boolean' }).notNull().default(false),
	emailMode: text('email_mode', { enum: INTAKE_EMAIL_MODES }).notNull().default('optional'),
	/** Welche Ticketfelder angeboten werden (ausgeblendet/optional/Pflicht); fehlende Felder nutzen die Standardwerte */
	fields: text('fields', { mode: 'json' })
		.$type<Partial<IntakeFields>>()
		.notNull()
		.default(sql`'{}'`),
	/** Nur die Tags aus intake_form_tag anbieten statt aller Tags der Projekte */
	restrictTags: integer('restrict_tags', { mode: 'boolean' }).notNull().default(false),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
});

/** Projekte eines Formulars; bei mehreren wählt die einreichende Person das Projekt */
export const intakeFormProject = sqliteTable(
	'intake_form_project',
	{
		formId: integer('form_id')
			.notNull()
			.references(() => intakeForm.id, { onDelete: 'cascade' }),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.formId, t.projectId] }), index('intake_form_project_project_idx').on(t.projectId)]
);

/** Erlaubte Tags eines Formulars (nur bei restrictTags); gelöschte Tags verschwinden per Cascade */
export const intakeFormTag = sqliteTable(
	'intake_form_tag',
	{
		formId: integer('form_id')
			.notNull()
			.references(() => intakeForm.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.formId, t.tagId] }), index('intake_form_tag_tag_idx').on(t.tagId)]
);

export type Project = typeof project.$inferSelect;
export type BoardColumn = typeof boardColumn.$inferSelect;
export type Ticket = typeof ticket.$inferSelect;
export type TicketLink = typeof ticketLink.$inferSelect;
export type Tag = typeof tag.$inferSelect;
export type Attachment = typeof attachment.$inferSelect;

/** Explicit access grants, independent of the authentication provider. */
export const projectMember = sqliteTable(
	'project_member',
	{
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['admin', 'member', 'reader'] }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull()
	},
	(t) => [primaryKey({ columns: [t.projectId, t.userId] }), index('project_member_user_idx').on(t.userId)]
);

/** Teams-Benachrichtigungen eines Projekts (ein Workflow-Webhook pro Projekt) */
export const projectNotification = sqliteTable('project_notification', {
	projectId: integer('project_id')
		.primaryKey()
		.references(() => project.id, { onDelete: 'cascade' }),
	/** Enthält die Signatur des Workflows: wie ein Passwort behandeln, nie ausliefern */
	webhookUrl: text('webhook_url').notNull(),
	events: text('events', { mode: 'json' }).$type<NotificationEvent[]>().notNull(),
	locale: text('locale', { enum: NOTIFICATION_LOCALES }).notNull().default('de'),
	lastSentAt: integer('last_sent_at', { mode: 'timestamp_ms' }),
	lastError: text('last_error')
});
