// Kleiner Client für die eigene REST-API (im Browser über die Session-Cookies authentifiziert)
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`/api/v1${path}`, {
		method,
		headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
	return data as T;
}

export const PRIORITY_LABELS: Record<string, string> = {
	low: 'Niedrig',
	medium: 'Mittel',
	high: 'Hoch',
	urgent: 'Dringend'
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
