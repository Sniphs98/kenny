import { z } from 'zod';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const LINK_TYPES = ['depends_on', 'relates'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type LinkType = (typeof LINK_TYPES)[number];

const id = z.number().int().positive();
const reference = z.union([id, z.string().trim().min(1).max(120)]);
const optionalReference = z.union([reference, z.literal(''), z.null()]).optional();
const text = z.string().max(100_000).nullable().optional();
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Bitte eine Farbe wie #6366f1 angeben.');
export const dateSchema = z.iso.date({ error: 'Bitte ein gültiges Datum im Format YYYY-MM-DD angeben.' });
const optionalDate = z.union([dateSchema, z.literal(''), z.null()]).optional();
const timestamp = z.union([z.date(), z.iso.datetime()]).transform((value) => new Date(value));

export const createProjectSchema = z.strictObject({
	name: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(120),
	key: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^([A-Z][A-Z0-9]{1,9})?$/, 'Kürzel: 2–10 Buchstaben/Ziffern, beginnt mit Buchstabe.')
		.optional(),
	description: text,
	color: colorSchema.optional()
});
export const updateProjectSchema = createProjectSchema.omit({ key: true }).partial();

const ticketFields = {
	title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(300),
	description: text,
	priority: z.enum(PRIORITIES).optional(),
	column: reference.nullable().optional(),
	columnId: id.optional(),
	position: z.number().int().nonnegative().nullable().optional(),
	assignee: z.string().max(320).nullable().optional(),
	assigneeId: z.string().max(320).nullable().optional(),
	parent: optionalReference,
	parentId: optionalReference,
	startDate: optionalDate,
	dueDate: optionalDate,
	tags: z.array(reference).max(100).optional()
};
function validDateRange(value: { startDate?: string | null; dueDate?: string | null }) {
	return !value.startDate || !value.dueDate || value.startDate <= value.dueDate;
}
const rangeError = { message: 'Startdatum liegt nach dem Fälligkeitsdatum.', path: ['dueDate'] };
export const createTicketSchema = z
	.strictObject({
		...ticketFields,
		dependsOn: z.array(reference).max(100).optional(),
		relatesTo: z.array(reference).max(100).optional()
	})
	.refine(validDateRange, rangeError);
export const updateTicketSchema = z.strictObject(ticketFields).partial().refine(validDateRange, rangeError);

export const createColumnSchema = z.strictObject({
	name: z.string().trim().min(1).max(60),
	isDone: z.boolean().optional(),
	isBacklog: z.boolean().optional()
});
export const updateColumnSchema = createColumnSchema
	.partial()
	.extend({ position: z.number().int().nonnegative().optional() });
export const createTagSchema = z.strictObject({
	name: z.string().trim().min(1).max(40),
	color: colorSchema.optional()
});
export const updateTagSchema = createTagSchema.partial();
export const createLinkSchema = z
	.strictObject({
		target: reference.optional(),
		targetId: id.optional(),
		type: z.enum(['depends_on', 'blocks', 'relates']).optional()
	})
	.refine((value) => value.target !== undefined || value.targetId !== undefined, {
		message: 'Zielticket fehlt.',
		path: ['target']
	});

export const tagSchema = z.object({ id, name: z.string(), color: colorSchema });
export const columnSchema = z.object({
	id,
	projectId: id,
	name: z.string(),
	position: z.number().int(),
	isDone: z.boolean(),
	isBacklog: z.boolean()
});
export const projectSchema = z.object({
	id,
	key: z.string(),
	name: z.string(),
	description: z.string(),
	color: colorSchema,
	createdAt: timestamp
});
export const projectListItemSchema = projectSchema.extend({ total: z.number().int(), open: z.number().int() });
export const projectDetailSchema = projectSchema.extend({ columns: z.array(columnSchema) });
export const ticketSchema = z.object({
	id,
	key: z.string(),
	projectId: id,
	number: id,
	title: z.string(),
	description: z.string(),
	priority: z.enum(PRIORITIES),
	columnId: id,
	status: z.string().nullable(),
	closed: z.boolean(),
	closedAt: timestamp.nullable(),
	position: z.number().int(),
	parentId: id.nullable(),
	assigneeId: z.string().nullable(),
	startDate: dateSchema.nullable(),
	dueDate: dateSchema.nullable(),
	createdAt: timestamp,
	updatedAt: timestamp
});
export const ticketDtoSchema = ticketSchema.extend({ tags: z.array(tagSchema) });
export const ticketListItemSchema = ticketDtoSchema.extend({
	assigneeName: z.string().nullable(),
	subtaskCount: z.number().int(),
	subtaskDone: z.number().int(),
	attachmentCount: z.number().int(),
	dependsOn: z.array(id),
	openBlockers: z.number().int()
});
export const attachmentSchema = z.object({
	id,
	ticketId: id,
	filename: z.string(),
	mimeType: z.string(),
	size: z.number().int().nonnegative(),
	isImage: z.boolean(),
	url: z.string(),
	uploadedBy: z.string().nullable(),
	createdAt: timestamp
});
export const dependencySchema = z.object({ id, sourceId: id, targetId: id });
export const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
export const ticketDetailSchema = ticketDtoSchema.extend({
	parent: ticketSchema.nullable(),
	subtasks: z.array(ticketSchema),
	links: z.array(
		z.object({
			id,
			type: z.enum(LINK_TYPES),
			relation: z.enum(['depends_on', 'blocks', 'relates']),
			ticket: z.object({ id, key: z.string(), title: z.string(), closed: z.boolean() })
		})
	),
	attachments: z.array(attachmentSchema),
	assignee: userSchema.nullable()
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type CreateTicketInput = z.input<typeof createTicketSchema>;
export type UpdateTicketInput = z.input<typeof updateTicketSchema>;
export type TagDto = z.output<typeof tagSchema>;
export type BoardColumnDto = z.output<typeof columnSchema>;
export type TicketDto = z.output<typeof ticketDtoSchema>;
export type TicketListItem = z.output<typeof ticketListItemSchema>;
export type AttachmentDto = z.output<typeof attachmentSchema>;
export type DependencyDto = z.output<typeof dependencySchema>;

// Form defaults belong to the form, not to PATCH contracts (missing means unchanged).
export const projectFormSchema = createProjectSchema.extend({
	key: createProjectSchema.shape.key.default(''),
	description: z.string().max(100_000).default(''),
	color: colorSchema.default('#6366f1')
});
export const ticketFormSchema = z
	.strictObject({
		title: ticketFields.title,
		description: z.string().max(100_000).default(''),
		priority: z.enum(PRIORITIES).default('medium'),
		assigneeId: z.string().nullable().default(null),
		tags: z.array(reference).max(100).default([]),
		startDate: z.union([dateSchema, z.literal('')]).default(''),
		dueDate: z.union([dateSchema, z.literal('')]).default(''),
		parentId: z.string().default(''),
		columnId: id.optional()
	})
	.refine(validDateRange, rangeError);
