// Live-Updates: Services melden Änderungen, verbundene Browser (Server-Sent Events) laden neu.
//
// Der Verteiler liegt im Speicher dieses Prozesses. Für mehrere Instanzen hinter einem
// Load Balancer bräuchte es einen gemeinsamen Kanal (z. B. Postgres LISTEN/NOTIFY oder Redis).
import { AsyncLocalStorage } from 'node:async_hooks';
export { LIVE_ORIGIN_HEADER } from '$lib/live-client';

export type LiveEvent = {
	projectId: number;
	/** Betroffenes Ticket, z. B. "WEB-3" (optional) */
	ticket?: string;
	/** 'deleted', wenn das Projekt selbst gelöscht wurde */
	kind: 'changed' | 'deleted';
	/** Kennung des Browser-Tabs, der die Änderung ausgelöst hat; der ignoriert seine eigenen Meldungen */
	origin?: string;
};

type Listener = (event: LiveEvent) => void;

const listeners = new Set<{ projectId: number | null; fn: Listener }>();

/** Kennung des auslösenden Tabs für die Dauer einer Anfrage (gesetzt in hooks.server.ts) */
export const liveOrigin = new AsyncLocalStorage<string | undefined>();

/** Änderung melden; erst nach erfolgreichem Speichern aufrufen */
export function publish(projectId: number, detail: { ticket?: string; kind?: LiveEvent['kind'] } = {}) {
	const event: LiveEvent = {
		projectId,
		kind: detail.kind ?? 'changed',
		ticket: detail.ticket,
		origin: liveOrigin.getStore()
	};
	for (const l of listeners) {
		if (l.projectId !== null && l.projectId !== projectId) continue;
		try {
			l.fn(event);
		} catch (error) {
			console.error('Live-Update konnte nicht zugestellt werden', error);
		}
	}
}

/** Auf Änderungen eines Projekts (oder aller Projekte mit null) hören; liefert die Abmeldung */
export function subscribe(projectId: number | null, fn: Listener) {
	const entry = { projectId, fn };
	listeners.add(entry);
	return () => {
		listeners.delete(entry);
	};
}

/** Anzahl verbundener Zuhörer (für Tests und Diagnose) */
export const listenerCount = () => listeners.size;
