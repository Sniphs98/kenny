import { localizeError, intlLocale } from '$lib/i18n';
import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';
import {
	createProjectSchema,
	updateProjectSchema,
	createTicketSchema,
	updateTicketSchema,
	projectSchema,
	ticketDtoSchema,
	ticketDetailSchema,
	type CreateProjectInput,
	type UpdateProjectInput,
	type CreateTicketInput,
	type UpdateTicketInput
} from '$lib/contracts';

const errorSchema = z.object({ error: z.string() });

// The low-level transport returns unknown; typed commands parse their responses.
export async function api(method: string, path: string, body?: unknown): Promise<unknown> {
	const res = await fetch(`/api/v1${path}`, {
		method,
		headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error(localizeError(errorSchema.safeParse(data).data?.error) || m.error({ value1: res.status }));
	return data;
}

const ref = (value: string | number) => encodeURIComponent(String(value));
export async function createProject(input: CreateProjectInput) {
	return projectSchema.parse(await api('POST', '/projects', createProjectSchema.parse(input)));
}
export async function updateProject(project: string | number, input: UpdateProjectInput) {
	return projectSchema.parse(await api('PATCH', `/projects/${ref(project)}`, updateProjectSchema.parse(input)));
}
export async function createTicket(project: string | number, input: CreateTicketInput) {
	return ticketDtoSchema.parse(await api('POST', `/projects/${ref(project)}/tickets`, createTicketSchema.parse(input)));
}
export async function updateTicket(ticket: string | number, input: UpdateTicketInput) {
	return ticketDtoSchema.parse(await api('PATCH', `/tickets/${ref(ticket)}`, updateTicketSchema.parse(input)));
}
export async function getTicket(ticket: string | number) {
	return ticketDetailSchema.parse(await api('GET', `/tickets/${ref(ticket)}`));
}

/** Dateien als multipart/form-data hochladen (Feld "file") */
export async function upload(path: string, files: File[]): Promise<unknown> {
	const body = new FormData();
	for (const f of files) body.append('file', f);
	const res = await fetch(`/api/v1${path}`, { method: 'POST', body });
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
