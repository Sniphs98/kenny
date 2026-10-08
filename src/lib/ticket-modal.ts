// Tickets per Shallow Routing als Modal öffnen: URL wechselt auf /tickets/KEY,
// der Hintergrund (Board, Gantt) bleibt stehen. Neu laden öffnet die volle Ticket-Seite.
import { goto, preloadData, pushState, replaceState } from '$app/navigation';

/**
 * Öffnet ein Ticket im Modal. Mit Strg/Cmd/Shift oder Mittelklick bleibt das normale
 * Link-Verhalten (neuer Tab), ohne Event wird immer das Modal geöffnet.
 * `replace` ersetzt den aktuellen Verlaufseintrag (Wechsel von Ticket zu Ticket im Modal),
 * damit Esc danach direkt zurück zum Board führt.
 */
export async function openTicket(key: string, e?: MouseEvent, replace = false) {
	if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
	e?.preventDefault();

	const href = `/tickets/${key}`;
	const result = await preloadData(href);
	if (result.type === 'loaded' && result.status === 200) {
		const state = { ticket: result.data as App.PageState['ticket'] };
		if (replace) replaceState(href, state);
		else pushState(href, state);
	} else {
		await goto(href);
	}
}
