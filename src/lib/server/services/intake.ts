// Formulare: Tickets per Link einreichen, je nach Einstellung auch ohne Anmeldung.
import { randomBytes } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { intakeFormSchema, intakeSubmissionSchema, type IntakeFormDto, type PublicIntakeForm } from '$lib/contracts';
import { db } from '../db';
import { intakeForm, intakeFormProject, project } from '../db/schema';
import { ApiError } from '../errors';
import { parseInput } from '../validation';
import { createTicket } from './tickets';

/** Unratbarer Teil des öffentlichen Links */
const newToken = () => randomBytes(18).toString('base64url');

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
		active: form.active,
		projects: projects.map(({ id, key, name }) => ({ id, key, name })),
		createdAt: form.createdAt
	};
}

export function listForms(): IntakeFormDto[] {
	const forms = db.select().from(intakeForm).orderBy(asc(intakeForm.name)).all();
	const projects = projectsOf(forms.map((f) => f.id));
	return forms.map((f) => present(f, projects.get(f.id) ?? []));
}

function getForm(id: number) {
	const form = Number.isInteger(id) ? db.select().from(intakeForm).where(eq(intakeForm.id, id)).get() : undefined;
	if (!form) throw new ApiError(404, 'Formular nicht gefunden.');
	return form;
}

function checkProjects(ids: number[]) {
	const unique = [...new Set(ids)];
	const found = db.select({ id: project.id }).from(project).where(inArray(project.id, unique)).all();
	if (found.length !== unique.length) throw new ApiError(400, 'Ein ausgewähltes Projekt gibt es nicht.');
	return unique;
}

export function createForm(rawInput: unknown, userId: string | null): IntakeFormDto {
	const input = parseInput(intakeFormSchema, rawInput);
	const projectIds = checkProjects(input.projectIds);
	const id = db.transaction((tx) => {
		const form = tx
			.insert(intakeForm)
			.values({
				name: input.name,
				token: newToken(),
				requireLogin: input.requireLogin,
				emailMode: input.emailMode,
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

export function updateForm(id: number, rawInput: unknown): IntakeFormDto {
	const form = getForm(id);
	const input = parseInput(intakeFormSchema, rawInput);
	const projectIds = checkProjects(input.projectIds);
	db.transaction((tx) => {
		tx.update(intakeForm)
			.set({ name: input.name, requireLogin: input.requireLogin, emailMode: input.emailMode, active: input.active })
			.where(eq(intakeForm.id, form.id))
			.run();
		tx.delete(intakeFormProject).where(eq(intakeFormProject.formId, form.id)).run();
		for (const projectId of projectIds) tx.insert(intakeFormProject).values({ formId: form.id, projectId }).run();
	});
	return getFormDto(form.id);
}

/** Neuen Link erzeugen; der bisherige funktioniert danach nicht mehr */
export function regenerateToken(id: number): IntakeFormDto {
	const form = getForm(id);
	db.update(intakeForm).set({ token: newToken() }).where(eq(intakeForm.id, form.id)).run();
	return getFormDto(form.id);
}

export function deleteForm(id: number) {
	const form = getForm(id);
	// Eingereichte Tickets bleiben; ihre Herkunft wird per Fremdschlüssel geleert
	db.delete(intakeForm).where(eq(intakeForm.id, form.id)).run();
}

function getFormDto(id: number) {
	return present(getForm(id), projectsOf([id]).get(id) ?? []);
}

/** Aktives Formular zum Link; deaktivierte oder alte Links verhalten sich wie unbekannte */
function activeFormByToken(token: string) {
	const form = token.length <= 64 ? db.select().from(intakeForm).where(eq(intakeForm.token, token)).get() : undefined;
	if (!form || !form.active) throw new ApiError(404, 'Formular nicht gefunden.');
	const projects = projectsOf([form.id]).get(form.id) ?? [];
	if (!projects.length) throw new ApiError(404, 'Formular nicht gefunden.');
	return { form, projects };
}

export function getPublicForm(token: string): PublicIntakeForm {
	const { form, projects } = activeFormByToken(token);
	return {
		name: form.name,
		requireLogin: form.requireLogin,
		emailMode: form.emailMode,
		projects: projects.map(({ key, name, color }) => ({ key, name, color }))
	};
}

// --- Begrenzung pro IP gegen Spam (im Speicher dieses Prozesses) ---
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

/**
 * Ticket über ein Formular einreichen.
 * Liefert den Ticketschlüssel; bei ausgefülltem Fallen-Feld (Bot) null, ohne etwas anzulegen.
 */
export function submitForm(
	token: string,
	rawInput: unknown,
	context: { user: { id: string } | null; ip: string }
): { key: string | null } {
	const { form, projects } = activeFormByToken(token);
	if (form.requireLogin && !context.user) throw new ApiError(401, 'Für dieses Formular ist eine Anmeldung nötig.');
	const input = parseInput(intakeSubmissionSchema, rawInput);
	// Bots füllen das unsichtbare Feld aus: so tun, als wäre alles gut, aber nichts anlegen
	if (input.website) return { key: null };
	if (!context.user) checkRate(context.ip);

	const target = projects.length === 1 ? projects[0] : projects.find((p) => p.key === input.project.toUpperCase());
	if (!target) throw new ApiError(400, 'Bitte ein Projekt auswählen.');

	let reporterEmail: string | null = null;
	if (!context.user && form.emailMode !== 'hidden') {
		reporterEmail = input.email || null;
		if (form.emailMode === 'required' && !reporterEmail) throw new ApiError(400, 'Bitte eine E-Mail-Adresse angeben.');
	}

	const ticket = createTicket(
		target.id,
		{ title: input.title, description: input.description },
		context.user?.id ?? null,
		{ intakeFormId: form.id, reporterEmail }
	);
	return { key: ticket.key };
}
