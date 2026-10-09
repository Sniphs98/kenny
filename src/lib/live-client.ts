// Gemeinsam für Browser und Server: Kennung dieses Browser-Tabs für Live-Updates.
// Der Tab schickt sie bei jeder Änderung mit und ignoriert Meldungen über seine eigenen Änderungen.

/** Header mit der Tab-Kennung */
export const LIVE_ORIGIN_HEADER = 'x-kenny-client';

/** Fenster-Ereignis nach einem Live-Update, z. B. damit ein offenes Ticket-Modal nachlädt */
export const LIVE_EVENT = 'kenny:live';

export const clientId =
	typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
