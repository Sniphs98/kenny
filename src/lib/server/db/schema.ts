import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
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

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

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
		parentId: integer('parent_id').references((): any => ticket.id, { onDelete: 'cascade' }),
		assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
		/** Start und Ende als YYYY-MM-DD für das Gantt-Chart */
		startDate: text('start_date'),
		dueDate: text('due_date'),
		closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
		createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
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
export const LINK_TYPES = ['depends_on', 'relates'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

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

export type Project = typeof project.$inferSelect;
export type BoardColumn = typeof boardColumn.$inferSelect;
export type Ticket = typeof ticket.$inferSelect;
export type TicketLink = typeof ticketLink.$inferSelect;
export type Tag = typeof tag.$inferSelect;
