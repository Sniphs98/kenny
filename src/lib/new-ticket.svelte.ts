// Wunsch „Neues Ticket“ aus der Befehlspalette an den Ticket-Dialog (Board oder Gantt) weitergeben.
// Ist der Dialog noch nicht da (z.B. aus den Einstellungen), öffnet er sich, sobald die Seite ihn zeigt.

export const newTicketRequest = $state({ pending: false });

export function requestNewTicket() {
	newTicketRequest.pending = true;
}

/** Vom Dialog aufgerufen: den Wunsch übernehmen (true) oder nichts zu tun (false) */
export function takeNewTicketRequest() {
	if (!newTicketRequest.pending) return false;
	newTicketRequest.pending = false;
	return true;
}
