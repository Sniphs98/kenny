// Tickets per Shallow Routing als Modal öffnen: URL wechselt auf /tickets/KEY,
// der Hintergrund (Board, Gantt) bleibt stehen. Neu laden öffnet die volle Ticket-Seite.
import { goto, preloadData } from '$app/navigation';
import { page } from '$app/state';

/**
 * Öffnet ein Ticket im Modal. Mit Strg/Cmd/Shift oder Mittelklick bleibt das normale
 * Link-Verhalten (neuer Tab), ohne Event wird immer das Modal geöffnet.
 * `nested` öffnet das Ticket aus einem bereits offenen Modal heraus (z. B. eine Unteraufgabe):
 * Es bekommt einen eigenen Verlaufseintrag, damit die Zurück-Taste zum vorherigen Ticket führt.
 * Die Tiefe merkt sich das Modal, um beim Schließen direkt zum Board zurückzuspringen.
 */
export async function openTicket(key: string, e?: MouseEvent, nested = false) {
	if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
	e?.preventDefault();

	const href = `/tickets/${key}`;
	const result = await preloadData(href);
	if (result.type === 'loaded' && result.status === 200) {
		const modalDepth = nested && page.state.ticket ? (page.state.modalDepth ?? 1) + 1 : 1;
		goto(href, { shallow: true, state: { ticket: result.data as App.PageState['ticket'], modalDepth } });
	} else {
		await goto(href);
	}
}

/** Modal schließen: alle Verlaufseinträge des Modals zurück, also direkt zum Board/Gantt */
export function closeTicketModal() {
	history.go(-(page.state.modalDepth ?? 1));
}
