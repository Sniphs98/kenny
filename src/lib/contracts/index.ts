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
	assignee: userSchema.nullable(),
	/** Herkunft, wenn das Ticket über ein Formular eingereicht wurde */
	submission: z.object({ form: z.string().nullable(), email: z.string().nullable() }).nullable()
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

export const GLOBAL_ROLES = ['admin', 'user'] as const;
export const PROJECT_ROLES = ['admin', 'member', 'reader'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export const updateUserSchema = z.strictObject({
	role: z.enum(GLOBAL_ROLES).optional(),
	active: z.boolean().optional()
});
export const addMemberSchema = z.strictObject({
	user: z.string().trim().min(1).max(320),
	role: z.enum(PROJECT_ROLES)
});
export const updateMemberSchema = addMemberSchema.pick({ role: true });
export const managedUserSchema = userSchema.extend({
	role: z.enum(GLOBAL_ROLES),
	active: z.boolean(),
	createdAt: timestamp,
	providers: z.array(z.string())
});
export const memberSchema = userSchema.extend({ role: z.enum(PROJECT_ROLES), active: z.boolean() });
export type ManagedUser = z.output<typeof managedUserSchema>;
export type ProjectMember = z.output<typeof memberSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type AddMemberInput = z.input<typeof addMemberSchema>;

// --- Formulare: Tickets per Link einreichen (auch ohne Anmeldung) ---

/** Sichtbarkeit eines Formularfelds: ausgeblendet, optional oder Pflicht */
export const INTAKE_FIELD_MODES = ['hidden', 'optional', 'required'] as const;
export type IntakeFieldMode = (typeof INTAKE_FIELD_MODES)[number];
/** E-Mail-Feld bei Formularen ohne Anmeldung */
export const INTAKE_EMAIL_MODES = INTAKE_FIELD_MODES;
export type IntakeEmailMode = IntakeFieldMode;

/** Ticketfelder, die ein Formular anbieten kann; der Titel ist immer Pflicht */
export const INTAKE_FIELDS = ['description', 'priority', 'startDate', 'dueDate', 'tags', 'attachments'] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];
const fieldMode = z.enum(INTAKE_FIELD_MODES);
export const intakeFieldsSchema = z.strictObject({
	description: fieldMode.default('optional'),
	priority: fieldMode.default('hidden'),
	startDate: fieldMode.default('hidden'),
	dueDate: fieldMode.default('hidden'),
	tags: fieldMode.default('hidden'),
	attachments: fieldMode.default('hidden')
});
export type IntakeFields = z.output<typeof intakeFieldsSchema>;
/** Höchstzahl an Dateien pro Einreichung */
export const INTAKE_MAX_FILES = 5;

/** Formular anlegen oder vollständig ändern (Einstellungsseite) */
export const intakeFormSchema = z.strictObject({
	name: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(120),
	projectIds: z.array(id).min(1, 'Bitte mindestens ein Projekt auswählen.').max(100),
	requireLogin: z.boolean().default(false),
	emailMode: z.enum(INTAKE_EMAIL_MODES).default('optional'),
	fields: intakeFieldsSchema.prefault({}),
	active: z.boolean().default(true)
});

/** Einreichung über ein Formular; "website" ist ein unsichtbares Fallen-Feld gegen Bots. Dateien kommen separat. */
export const intakeSubmissionSchema = z
	.strictObject({
		project: z.string().trim().max(20).default(''),
		title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(300),
		description: z.string().max(100_000).default(''),
		priority: z.union([z.enum(PRIORITIES), z.literal('')]).default(''),
		startDate: z.union([dateSchema, z.literal('')]).default(''),
		dueDate: z.union([dateSchema, z.literal('')]).default(''),
		tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
		email: z
			.union([z.literal(''), z.email({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }).max(320)])
			.default(''),
		website: z.string().max(500).default('')
	})
	.refine(validDateRange, rangeError);

export const intakeFormDtoSchema = z.object({
	id,
	name: z.string(),
	token: z.string(),
	requireLogin: z.boolean(),
	emailMode: z.enum(INTAKE_EMAIL_MODES),
	fields: intakeFieldsSchema,
	active: z.boolean(),
	projects: z.array(z.object({ id, key: z.string(), name: z.string() })),
	createdAt: timestamp
});

/** Was die öffentliche Seite über ein Formular erfährt (ohne interne IDs außer dem Projektkürzel) */
export const publicIntakeFormSchema = z.object({
	name: z.string(),
	requireLogin: z.boolean(),
	emailMode: z.enum(INTAKE_EMAIL_MODES),
	fields: intakeFieldsSchema,
	projects: z.array(
		z.object({
			key: z.string(),
			name: z.string(),
			color: z.string(),
			/** Nur gefüllt, wenn das Formular Tags anbietet */
			tags: z.array(z.object({ name: z.string(), color: z.string() }))
		})
	)
});

export type IntakeFormInput = z.input<typeof intakeFormSchema>;
export type IntakeSubmissionInput = z.input<typeof intakeSubmissionSchema>;
export type IntakeFormDto = z.output<typeof intakeFormDtoSchema>;
export type PublicIntakeForm = z.output<typeof publicIntakeFormSchema>;
