// @ts-check
// Szenarien prüfen und über die REST-API einer laufenden Kenny-Instanz befüllen.
// Bewusst über die API statt direkt in die Datenbank: Es gelten dieselben Regeln wie in der App,
// und die Szenarien sind unabhängig von der Datenbank (SQLite heute, später z.B. Postgres).

/**
 * @typedef {{ name: string; email: string }} ScenarioUser
 * @typedef {{ name: string; text?: string; base64?: string; type?: string }} ScenarioAttachment
 * @typedef {{
 *   ref?: string;
 *   title: string;
 *   description?: string;
 *   priority?: 'low' | 'medium' | 'high' | 'urgent';
 *   column?: string;
 *   assignee?: string;
 *   start?: number;
 *   due?: number;
 *   tags?: string[];
 *   dependsOn?: string[];
 *   relatesTo?: string[];
 *   closed?: boolean;
 *   subtasks?: ScenarioTicket[];
 *   attachments?: ScenarioAttachment[];
 * }} ScenarioTicket
 * @typedef {{
 *   name: string;
 *   key: string;
 *   color?: string;
 *   description?: string;
 *   tags?: { name: string; color?: string }[];
 *   tickets?: ScenarioTicket[];
 * }} ScenarioProject
 * @typedef {{ description: string; users: ScenarioUser[]; projects?: ScenarioProject[] }} Scenario
 */

/** Passwort aller Szenario-Benutzer; nur für lokale Testdaten gedacht */
export const SCENARIO_PASSWORD = 'kenny-demo';

/** Spalten, die jedes neue Projekt bekommt (siehe DEFAULT_COLUMNS in services/projects.ts) */
const DEFAULT_COLUMNS = ['Offen', 'In Arbeit', 'Review', 'Erledigt'];
const DEFAULT_TAGS = ['Bug', 'Feature', 'Story'];

/** Datum relativ zu heute als YYYY-MM-DD (lokale Zeit) */
export function day(offset = 0) {
	const d = new Date();
	d.setDate(d.getDate() + offset);
	const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Alle Tickets eines Projekts inklusive Unteraufgaben, in Anlagereihenfolge
 * @param {ScenarioTicket[]} tickets
 * @returns {ScenarioTicket[]}
 */
function flatten(tickets) {
	return tickets.flatMap((t) => [t, ...flatten(t.subtasks ?? [])]);
}

/**
 * Prüft ein Szenario vor dem Befüllen und liefert verständliche Fehler statt halb angelegter Daten.
 * @param {Scenario} scenario
 * @returns {string[]}
 */
export function validateScenario(scenario) {
	const errors = [];
	const emails = new Set();
	if (!scenario.users?.length) errors.push('Mindestens ein Benutzer ist nötig (der erste wird zum Anmelden genutzt).');
	for (const u of scenario.users ?? []) {
		if (emails.has(u.email)) errors.push(`Benutzer ${u.email} ist doppelt.`);
		emails.add(u.email);
	}
	const keys = new Set();
	for (const p of scenario.projects ?? []) {
		if (!/^[A-Z][A-Z0-9]{1,9}$/.test(p.key)) errors.push(`Projekt ${p.name}: Kürzel "${p.key}" ist ungültig.`);
		if (keys.has(p.key)) errors.push(`Projektkürzel ${p.key} ist doppelt.`);
		keys.add(p.key);
		const tags = new Set([...DEFAULT_TAGS, ...(p.tags ?? []).map((t) => t.name)]);
		const all = flatten(p.tickets ?? []);
		const refs = new Set();
		for (const t of all) {
			if (!t.ref) continue;
			if (refs.has(t.ref)) errors.push(`${p.key}: Ticket-Ref "${t.ref}" ist doppelt.`);
			refs.add(t.ref);
		}
		for (const t of all) {
			const where = `${p.key} „${t.title}“`;
			if (t.column && !DEFAULT_COLUMNS.includes(t.column)) errors.push(`${where}: Spalte "${t.column}" gibt es nicht.`);
			if (t.assignee && !emails.has(t.assignee)) errors.push(`${where}: Zuständige(r) ${t.assignee} fehlt in users.`);
			if (t.start !== undefined && t.due !== undefined && t.start > t.due)
				errors.push(`${where}: Start liegt nach dem Fälligkeitsdatum.`);
			for (const tag of t.tags ?? []) if (!tags.has(tag)) errors.push(`${where}: Tag "${tag}" fehlt.`);
			for (const ref of [...(t.dependsOn ?? []), ...(t.relatesTo ?? [])]) {
				if (!refs.has(ref)) errors.push(`${where}: Verweis auf unbekanntes Ticket "${ref}".`);
				if (ref === t.ref) errors.push(`${where}: Ticket verweist auf sich selbst.`);
			}
		}
	}
	return errors;
}

/**
 * Befüllt eine laufende Instanz mit einem Szenario.
 * @param {string} baseUrl z.B. http://localhost:5173
 * @param {Scenario} scenario
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {Promise<{ users: number; projects: number; tickets: number }>}
 */
export async function seedScenario(baseUrl, scenario, { log = () => {} } = {}) {
	const errors = validateScenario(scenario);
	if (errors.length) throw new Error(`Szenario ist ungültig:\n- ${errors.join('\n- ')}`);

	const origin = new URL(baseUrl).origin;
	let cookie = '';

	/**
	 * @param {string} method
	 * @param {string} path
	 * @param {unknown} [body]
	 * @param {{ form?: FormData; anonymous?: boolean }} [options]
	 */
	async function call(method, path, body, { form, anonymous = false } = {}) {
		/** @type {Record<string, string>} */
		const headers = { origin };
		if (cookie && !anonymous) headers.cookie = cookie;
		if (body !== undefined) headers['content-type'] = 'application/json';
		const res = await fetch(origin + path, {
			method,
			headers,
			body: form ?? (body !== undefined ? JSON.stringify(body) : undefined)
		});
		const text = await res.text();
		if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
		return { res, data: text ? JSON.parse(text) : null };
	}

	for (const [index, user] of scenario.users.entries()) {
		const { res } = await call(
			'POST',
			'/api/auth/sign-up/email',
			{ name: user.name, email: user.email, password: SCENARIO_PASSWORD },
			{ anonymous: true }
		);
		// Mit der Sitzung des ersten Benutzers wird alles Weitere angelegt
		if (index === 0)
			cookie = res.headers
				.getSetCookie()
				.map((c) => c.split(';')[0])
				.join('; ');
	}
	if (!cookie) throw new Error('Keine Sitzung nach der Registrierung erhalten.');
	log(`${scenario.users.length} Benutzer angelegt`);

	let tickets = 0;
	for (const p of scenario.projects ?? []) {
		await call('POST', '/api/v1/projects', { name: p.name, key: p.key, color: p.color, description: p.description });
		for (const tag of p.tags ?? []) await call('POST', `/api/v1/projects/${p.key}/tags`, tag);

		/** @type {Map<string, string>} Szenario-Ref → Ticketschlüssel, z.B. "login" → "WEB-3" */
		const keys = new Map();
		/** @type {{ ticket: ScenarioTicket; key: string }[]} */
		const created = [];

		/** @param {ScenarioTicket} t @param {string | undefined} parent */
		async function create(t, parent) {
			const { data } = await call('POST', `/api/v1/projects/${p.key}/tickets`, {
				title: t.title,
				description: t.description,
				priority: t.priority,
				column: t.column,
				assignee: t.assignee,
				startDate: t.start !== undefined ? day(t.start) : undefined,
				dueDate: t.due !== undefined ? day(t.due) : undefined,
				tags: t.tags,
				parent
			});
			if (t.ref) keys.set(t.ref, data.key);
			created.push({ ticket: t, key: data.key });
			for (const a of t.attachments ?? []) {
				const form = new FormData();
				const content = a.base64 ? Buffer.from(a.base64, 'base64') : (a.text ?? '');
				form.append('file', new Blob([content], { type: a.type ?? 'text/plain' }), a.name);
				await call('POST', `/api/v1/tickets/${data.key}/attachments`, undefined, { form });
			}
			for (const s of t.subtasks ?? []) await create(s, data.key);
		}
		for (const t of p.tickets ?? []) await create(t, undefined);

		// Verknüpfungen erst, wenn alle Tickets existieren; abschließen ganz zum Schluss
		for (const { ticket, key } of created) {
			for (const ref of ticket.dependsOn ?? [])
				await call('POST', `/api/v1/tickets/${key}/links`, { target: keys.get(ref), type: 'depends_on' });
			for (const ref of ticket.relatesTo ?? [])
				await call('POST', `/api/v1/tickets/${key}/links`, { target: keys.get(ref), type: 'relates' });
		}
		for (const { ticket, key } of created) if (ticket.closed) await call('POST', `/api/v1/tickets/${key}/close`);

		tickets += created.length;
		log(`Projekt ${p.key}: ${created.length} Tickets`);
	}
	return { users: scenario.users.length, projects: scenario.projects?.length ?? 0, tickets };
}
