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

/** Dateien als multipart/form-data hochladen (Feld "file") */
export async function upload<T = unknown>(path: string, files: File[]): Promise<T> {
	const body = new FormData();
	for (const f of files) body.append('file', f);
	const res = await fetch(`/api/v1${path}`, { method: 'POST', body });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? (res.status === 413 ? 'Datei ist zu groß.' : `Fehler ${res.status}`));
	return data as T;
}

/** Dateigröße lesbar, z.B. 1,4 MB */
export function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let v = bytes / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) (v /= 1024), i++;
	return `${v.toLocaleString('de-DE', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
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
