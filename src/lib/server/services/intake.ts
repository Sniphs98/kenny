// Formulare: Tickets per Link einreichen, je nach Einstellung auch ohne Anmeldung.
//
// Rechte: Formulare verwaltet, wer Projekt-Admin aller Projekte des Formulars ist (oder Instanz-Admin).
// Einreichen darf über ein Formular mit Anmeldung jede aktive angemeldete Person, auch ohne
// Projektmitgliedschaft – das Formular ist genau diese bewusste Freigabe durch den Projekt-Admin.
import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
	INTAKE_MAX_FILES,
	intakeFieldsSchema,
	intakeFormSchema,
	intakeSubmissionSchema,
	type IntakeFields,
	type IntakeFormDto,
	type PublicIntakeForm
} from '$lib/contracts';
import { db } from '../db';
import { intakeForm, intakeFormProject, project, projectMember, tag } from '../db/schema';
import { ApiError } from '../errors';
import { parseInput } from '../validation';
import { requireActiveUser } from './access';
import { addAttachments, checkFileSizes } from './attachments';
import { createTicket } from './tickets';

/** Unratbarer Teil des öffentlichen Links */
const newToken = () => randomBytes(18).toString('base64url');

/** Gespeicherte Feldeinstellungen mit Standardwerten für fehlende Felder */
const fieldsOf = (form: typeof intakeForm.$inferSelect): IntakeFields => intakeFieldsSchema.parse(form.fields ?? {});

function projectsOf(formIds: number[]) {
	const rows = formIds.length
		? db
				.select({
					formId: intakeFormProject.formId,
					id: project.id,
					key: project.key,
					name: project.name,
					color: project.color
				})
				.from(intakeFormProject)
				.innerJoin(project, eq(project.id, intakeFormProject.projectId))
				.where(inArray(intakeFormProject.formId, formIds))
				.orderBy(asc(project.name))
				.all()
		: [];
	const byForm = new Map<number, typeof rows>();
	for (const r of rows) byForm.set(r.formId, [...(byForm.get(r.formId) ?? []), r]);
	return byForm;
}

function present(
	form: typeof intakeForm.$inferSelect,
	projects: { id: number; key: string; name: string }[]
): IntakeFormDto {
	return {
		id: form.id,
		name: form.name,
		token: form.token,
		requireLogin: form.requireLogin,
		emailMode: form.emailMode,
		fields: fieldsOf(form),
		active: form.active,
		projects: projects.map(({ id, key, name }) => ({ id, key, name })),
		createdAt: form.createdAt
	};
}

// --- Verwaltung (nur Projekt-Admins der betroffenen Projekte) ---

/** Projekte, die der Benutzer verwaltet; null = alle (Instanz-Admin) */
export function manageableProjectIds(userId: string): Set<number> | null {
	if (requireActiveUser(userId).role === 'admin') return null;
	return new Set(
		db
			.select({ id: projectMember.projectId })
			.from(projectMember)
			.where(and(eq(projectMember.userId, userId), eq(projectMember.role, 'admin')))
			.all()
			.map((m) => m.id)
	);
}

const canManage = (allowed: Set<number> | null, projectIds: number[]) =>
	allowed === null || projectIds.every((id) => allowed.has(id));

export function listForms(userId: string): IntakeFormDto[] {
	const allowed = manageableProjectIds(userId);
	const forms = db.select().from(intakeForm).orderBy(asc(intakeForm.name)).all();
	const projects = projectsOf(forms.map((f) => f.id));
	return forms
		.map((f) => present(f, projects.get(f.id) ?? []))
		.filter((f) =>
			canManage(
				allowed,
				f.projects.map((p) => p.id)
			)
		);
}

/** Formular, das der Benutzer verwalten darf; fremde Formulare verhalten sich wie nicht vorhandene */
function getManagedForm(id: number, userId: string) {
	const form = Number.isInteger(id) ? db.select().from(intakeForm).where(eq(intakeForm.id, id)).get() : undefined;
	const projectIds = form ? (projectsOf([form.id]).get(form.id) ?? []).map((p) => p.id) : [];
	if (!form || !canManage(manageableProjectIds(userId), projectIds))
		throw new ApiError(404, 'Formular nicht gefunden.');
	return form;
}

function checkProjects(ids: number[], userId: string) {
	const unique = [...new Set(ids)];
	const found = db.select({ id: project.id }).from(project).where(inArray(project.id, unique)).all();
	if (found.length !== unique.length) throw new ApiError(400, 'Ein ausgewähltes Projekt gibt es nicht.');
	if (!canManage(manageableProjectIds(userId), unique)) throw new ApiError(403, 'Unzureichende Projektberechtigungen.');
	return unique;
}

export function createForm(rawInput: unknown, userId: string): IntakeFormDto {
	const input = parseInput(intakeFormSchema, rawInput);
	const projectIds = checkProjects(input.projectIds, userId);
	const id = db.transaction((tx) => {
		const form = tx
			.insert(intakeForm)
			.values({
				name: input.name,
				token: newToken(),
				requireLogin: input.requireLogin,
				emailMode: input.emailMode,
				fields: input.fields,
				active: input.active,
				createdById: userId
			})
			.returning()
			.get();
		for (const projectId of projectIds) tx.insert(intakeFormProject).values({ formId: form.id, projectId }).run();
		return form.id;
	});
	return getFormDto(id);
}

export function updateForm(id: number, rawInput: unknown, userId: string): IntakeFormDto {
	const form = getManagedForm(id, userId);
	const input = parseInput(intakeFormSchema, rawInput);
	const projectIds = checkProjects(input.projectIds, userId);
	db.transaction((tx) => {
		tx.update(intakeForm)
			.set({
				name: input.name,
				requireLogin: input.requireLogin,
				emailMode: input.emailMode,
				fields: input.fields,
				active: input.active
			})
			.where(eq(intakeForm.id, form.id))
			.run();
		tx.delete(intakeFormProject).where(eq(intakeFormProject.formId, form.id)).run();
		for (const projectId of projectIds) tx.insert(intakeFormProject).values({ formId: form.id, projectId }).run();
	});
	return getFormDto(form.id);
}

/** Neuen Link erzeugen; der bisherige funktioniert danach nicht mehr */
export function regenerateToken(id: number, userId: string): IntakeFormDto {
	const form = getManagedForm(id, userId);
	db.update(intakeForm).set({ token: newToken() }).where(eq(intakeForm.id, form.id)).run();
	return getFormDto(form.id);
}

export function deleteForm(id: number, userId: string) {
	const form = getManagedForm(id, userId);
	// Eingereichte Tickets bleiben; ihre Herkunft wird per Fremdschlüssel geleert
	db.delete(intakeForm).where(eq(intakeForm.id, form.id)).run();
}

function getFormDto(id: number) {
	const form = db.select().from(intakeForm).where(eq(intakeForm.id, id)).get()!;
	return present(form, projectsOf([id]).get(id) ?? []);
}

// --- Öffentliche Seite und Einreichen ---

/** Aktives Formular zum Link; deaktivierte oder alte Links verhalten sich wie unbekannte */
function activeFormByToken(token: string) {
	const form = token.length <= 64 ? db.select().from(intakeForm).where(eq(intakeForm.token, token)).get() : undefined;
	if (!form || !form.active) throw new ApiError(404, 'Formular nicht gefunden.');
	const projects = projectsOf([form.id]).get(form.id) ?? [];
	if (!projects.length) throw new ApiError(404, 'Formular nicht gefunden.');
	return { form, fields: fieldsOf(form), projects };
}

function tagsOf(projectIds: number[]) {
	const rows = projectIds.length
		? db
				.select({ id: tag.id, projectId: tag.projectId, name: tag.name, color: tag.color })
				.from(tag)
				.where(inArray(tag.projectId, projectIds))
				.orderBy(asc(tag.name))
				.all()
		: [];
	const byProject = new Map<number, typeof rows>();
	for (const r of rows) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r]);
	return byProject;
}

export function getPublicForm(token: string): PublicIntakeForm {
	const { form, fields, projects } = activeFormByToken(token);
	const tags = fields.tags === 'hidden' ? new Map() : tagsOf(projects.map((p) => p.id));
	return {
		name: form.name,
		requireLogin: form.requireLogin,
		emailMode: form.emailMode,
		fields,
		projects: projects.map(({ id, key, name, color }) => ({
			key,
			name,
			color,
			tags: (tags.get(id) ?? []).map(({ name, color }: { name: string; color: string }) => ({ name, color }))
		}))
	};
}

// Begrenzung pro IP gegen Spam (im Speicher dieses Prozesses)
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();

function checkRate(key: string, now = Date.now()) {
	const hits = (recent.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
	if (hits.length >= RATE_LIMIT) throw new ApiError(429, 'Zu viele Einreichungen. Bitte später erneut versuchen.');
	hits.push(now);
	recent.set(key, hits);
	// Speicher nicht unbegrenzt wachsen lassen
	if (recent.size > 10_000) recent.clear();
}

/** Nur für Tests: Begrenzung zurücksetzen */
export function resetRateLimit() {
	recent.clear();
}

/** Meldungen für fehlende Pflichtfelder */
const MISSING: Record<keyof IntakeFields, string> = {
	description: 'Bitte eine Beschreibung angeben.',
	priority: 'Bitte eine Priorität wählen.',
	startDate: 'Bitte ein Startdatum angeben.',
	dueDate: 'Bitte ein Fälligkeitsdatum angeben.',
	tags: 'Bitte mindestens einen Tag wählen.',
	attachments: 'Bitte mindestens eine Datei anhängen.'
};

/**
 * Ticket über ein Formular einreichen.
 * Liefert den Ticketschlüssel; bei ausgefülltem Fallen-Feld (Bot) null, ohne etwas anzulegen.
 * Ausgeblendete Felder werden ignoriert, auch wenn sie mitgeschickt werden.
 */
export async function submitForm(
	token: string,
	rawInput: unknown,
	context: { user: { id: string } | null; ip: string; files?: File[] }
): Promise<{ key: string | null }> {
	const { form, fields, projects } = activeFormByToken(token);
	if (form.requireLogin && !context.user) throw new ApiError(401, 'Für dieses Formular ist eine Anmeldung nötig.');
	const input = parseInput(intakeSubmissionSchema, rawInput);
	// Bots füllen das unsichtbare Feld aus: so tun, als wäre alles gut, aber nichts anlegen
	if (input.website) return { key: null };
	if (!context.user) checkRate(context.ip);

	const target = projects.length === 1 ? projects[0] : projects.find((p) => p.key === input.project.toUpperCase());
	if (!target) throw new ApiError(400, 'Bitte ein Projekt auswählen.');

	/** Wert nur übernehmen, wenn das Feld angeboten wird; Pflichtfelder müssen gefüllt sein */
	function value<T>(field: keyof IntakeFields, raw: T, present: boolean): T | undefined {
		if (fields[field] === 'hidden') return undefined;
		if (fields[field] === 'required' && !present) throw new ApiError(400, MISSING[field]);
		return present ? raw : undefined;
	}
	const description = value('description', input.description, input.description.trim() !== '');
	const priority = value('priority', input.priority, input.priority !== '');
	const startDate = value('startDate', input.startDate, input.startDate !== '');
	const dueDate = value('dueDate', input.dueDate, input.dueDate !== '');
	const tagNames = value('tags', input.tags, input.tags.length > 0) ?? [];
	const files = value('attachments', context.files ?? [], (context.files ?? []).length > 0) ?? [];

	// Nur vorhandene Tags des Projekts; über ein Formular entstehen keine neuen Tags
	const projectTags = tagsOf([target.id]).get(target.id) ?? [];
	const tagIds = tagNames.map((name) => {
		const found = projectTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
		if (!found) throw new ApiError(400, `Tag ${name} gibt es in diesem Projekt nicht.`);
		return found.id;
	});
	if (files.length > INTAKE_MAX_FILES) throw new ApiError(400, `Höchstens ${INTAKE_MAX_FILES} Dateien.`);
	checkFileSizes(files);

	let reporterEmail: string | null = null;
	if (!context.user && form.emailMode !== 'hidden') {
		reporterEmail = input.email || null;
		if (form.emailMode === 'required' && !reporterEmail) throw new ApiError(400, 'Bitte eine E-Mail-Adresse angeben.');
	}

	const ticket = createTicket(
		target.id,
		{ title: input.title, description, priority: priority || undefined, startDate, dueDate, tags: tagIds },
		context.user?.id ?? null,
		{ intakeFormId: form.id, reporterEmail }
	);
	if (files.length) await addAttachments(ticket.key, files, context.user?.id ?? null);
	return { key: ticket.key };
}
