import { localizeError, intlLocale } from '#lib/i18n.js';
import { clientId, LIVE_ORIGIN_HEADER } from '#lib/live-client.js';
import { m } from '#lib/paraglide/messages.js';
import { z } from 'zod';
import {
	userProjectSchema,
	assignUserProjectSchema,
	type AssignUserProjectInput,
	managedUserSchema,
	updateUserSchema,
	memberSchema,
	addMemberSchema,
	updateMemberSchema,
	type UpdateUserInput,
	type AddMemberInput,
	type ProjectRole,
	createProjectSchema,
	updateProjectSchema,
	createColumnSchema,
	createTicketSchema,
	updateTicketSchema,
	reorderTicketsSchema,
	ticketOrderSchema,
	type ReorderTicketsInput,
	projectSchema,
	columnSchema,
	ticketDtoSchema,
	ticketDetailSchema,
	commentSchema,
	createCommentSchema,
	type CreateCommentInput,
	ticketSearchResultSchema,
	type CreateProjectInput,
	type UpdateProjectInput,
	type CreateTicketInput,
	type UpdateTicketInput,
	notificationsDtoSchema,
	updateNotificationsSchema,
	type UpdateNotificationsInput,
	emailNotificationsDtoSchema,
	updateEmailNotificationsSchema,
	type UpdateEmailNotificationsInput
} from '#lib/contracts/index.js';

const errorSchema = z.object({ error: z.string() });

// The low-level transport returns unknown; typed commands parse their responses.
export async function api(method: string, path: string, body?: unknown): Promise<unknown> {
	const res = await fetch(`/api/v1${path}`, {
		method,
		// Tab-Kennung: Live-Updates über die eigene Änderung ignoriert dieser Tab
		headers: {
			[LIVE_ORIGIN_HEADER]: clientId,
			...(body !== undefined || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
				? { 'content-type': 'application/json' }
				: {})
		},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error(localizeError(errorSchema.safeParse(data).data?.error) || m.error({ value1: res.status }));
	return data;
}

const ref = (value: string | number) => encodeURIComponent(String(value));
export async function assignUserProject(user: string, input: AssignUserProjectInput) {
	return userProjectSchema.parse(
		await api('POST', `/admin/users/${ref(user)}/projects`, assignUserProjectSchema.parse(input))
	);
}
export async function changeUserProject(user: string, project: number, role: ProjectRole | null) {
	return z
		.object({ ok: z.literal(true) })
		.parse(
			await api(
				role === null ? 'DELETE' : 'PATCH',
				`/admin/users/${ref(user)}/projects/${project}`,
				role === null ? undefined : updateMemberSchema.parse({ role })
			)
		);
}
export async function createProject(input: CreateProjectInput) {
	return projectSchema.parse(await api('POST', '/projects', createProjectSchema.parse(input)));
}
export async function updateProject(project: string | number, input: UpdateProjectInput) {
	return projectSchema.parse(await api('PATCH', `/projects/${ref(project)}`, updateProjectSchema.parse(input)));
}
export async function createColumn(project: string | number, input: { name: string; isBacklog?: boolean }) {
	return columnSchema.parse(await api('POST', `/projects/${ref(project)}/columns`, createColumnSchema.parse(input)));
}
export async function createTicket(project: string | number, input: CreateTicketInput) {
	return ticketDtoSchema.parse(await api('POST', `/projects/${ref(project)}/tickets`, createTicketSchema.parse(input)));
}
export async function updateTicket(ticket: string | number, input: UpdateTicketInput) {
	return ticketDtoSchema.parse(await api('PATCH', `/tickets/${ref(ticket)}`, updateTicketSchema.parse(input)));
}
/** Manuelle Reihenfolge einer Spalte setzen */
export async function reorderTickets(project: string | number, input: ReorderTicketsInput) {
	return ticketOrderSchema.parse(
		await api('PUT', `/projects/${ref(project)}/tickets/order`, reorderTicketsSchema.parse(input))
	);
}
export async function closeTicket(ticket: string | number) {
	return ticketDtoSchema.parse(await api('POST', `/tickets/${ref(ticket)}/close`));
}
export async function reopenTicket(ticket: string | number) {
	return ticketDtoSchema.parse(await api('POST', `/tickets/${ref(ticket)}/reopen`));
}
export async function getTicket(ticket: string | number) {
	return ticketDetailSchema.parse(await api('GET', `/tickets/${ref(ticket)}`));
}
export async function addComment(ticket: string | number, input: CreateCommentInput) {
	return commentSchema.parse(await api('POST', `/tickets/${ref(ticket)}/comments`, createCommentSchema.parse(input)));
}
export async function deleteComment(ticket: string | number, commentId: number) {
	return z.object({ ok: z.literal(true) }).parse(await api('DELETE', `/tickets/${ref(ticket)}/comments/${commentId}`));
}

/** Dateien als multipart/form-data hochladen (Feld "file") */
export async function upload(path: string, files: File[]): Promise<unknown> {
	const body = new FormData();
	for (const f of files) body.append('file', f);
	const res = await fetch(`/api/v1${path}`, { method: 'POST', body, headers: { [LIVE_ORIGIN_HEADER]: clientId } });
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error(
			localizeError(errorSchema.safeParse(data).data?.error) ||
				(res.status === 413 ? m.file_is_too_large() : m.error({ value1: res.status }))
		);
	return data;
}

/** Dateigröße lesbar, z.B. 1,4 MB */
export function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let v = bytes / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toLocaleString(intlLocale(), { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

export const PRIORITY_LABELS: Record<string, string> = {
	get low() {
		return m.low();
	},
	get medium() {
		return m.medium();
	},
	get high() {
		return m.high();
	},
	get urgent() {
		return m.urgent();
	}
};

/** Initialen für Avatare, z.B. "Max Muster" → "MM" */
export function initials(name: string | null | undefined) {
	return (name ?? '')
		.split(/\s+/)
		.map((p) => p[0] ?? '')
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

export async function updateUser(user: string, input: UpdateUserInput) {
	return managedUserSchema.parse(await api('PATCH', `/admin/users/${ref(user)}`, updateUserSchema.parse(input)));
}
export async function addProjectMember(project: string, input: AddMemberInput) {
	return memberSchema.parse(await api('POST', `/projects/${ref(project)}/members`, addMemberSchema.parse(input)));
}
export async function changeProjectMember(project: string, user: string, role: ProjectRole | null) {
	return z
		.object({ ok: z.literal(true) })
		.parse(
			await api(
				role === null ? 'DELETE' : 'PATCH',
				`/projects/${ref(project)}/members/${ref(user)}`,
				role === null ? undefined : updateMemberSchema.parse({ role })
			)
		);
}

/** Teams-Benachrichtigungen eines Projekts (nur Projektadministratoren) */
export async function getNotifications(project: string | number) {
	return notificationsDtoSchema.parse(await api('GET', `/projects/${ref(project)}/notifications`));
}
export async function updateNotifications(project: string | number, input: UpdateNotificationsInput) {
	return notificationsDtoSchema.parse(
		await api('PUT', `/projects/${ref(project)}/notifications`, updateNotificationsSchema.parse(input))
	);
}
export async function sendTestNotification(project: string | number) {
	return notificationsDtoSchema.parse(await api('POST', `/projects/${ref(project)}/notifications/test`));
}

/** E-Mail-Benachrichtigungen eines Projekts (nur Projektadministratoren) */
export async function updateEmailNotifications(project: string | number, input: UpdateEmailNotificationsInput) {
	return emailNotificationsDtoSchema.parse(
		await api('PUT', `/projects/${ref(project)}/email-notifications`, updateEmailNotificationsSchema.parse(input))
	);
}
export async function sendTestEmailNotification(project: string | number) {
	return emailNotificationsDtoSchema.parse(await api('POST', `/projects/${ref(project)}/email-notifications/test`));
}

/** Tickets aller sichtbaren Projekte, nach Treffergüte sortiert */
export async function searchTickets(query: string, limit = 8) {
	const params = new URLSearchParams({ q: query, limit: String(limit) });
	return ticketSearchResultSchema.parse(await api('GET', `/search?${params}`));
}
export async function listProjects() {
	return z.array(projectSchema).parse(await api('GET', '/projects'));
}
