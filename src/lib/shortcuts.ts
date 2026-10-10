// Einfache Tastenkürzel (z.B. „C“ für ein neues Ticket), wie in Jira, Linear oder GitHub.

/** Taste für „Neues Ticket“; als aria-keyshortcuts und im Tooltip angezeigt */
export const NEW_TICKET_KEY = 'c';

/** Elemente, in denen getippt wird: dort sind Buchstaben Text und keine Kürzel */
export function isTypingTarget(target: EventTarget | null) {
	if (!target || typeof (target as Element).closest !== 'function') return false;
	const el = target as HTMLElement;
	return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"]');
}

/** Soll ein Tastendruck als Kürzel für key gelten? */
export function isShortcut(event: KeyboardEvent, key: string) {
	if (event.key.toLowerCase() !== key || event.repeat || event.isComposing) return false;
	if (event.ctrlKey || event.metaKey || event.altKey) return false;
	if (isTypingTarget(event.target)) return false;
	// Bei offenem Dialog oder Menü gehört die Tastatur dorthin
	return !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]');
}
