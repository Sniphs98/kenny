/** Nur Ziele innerhalb von Kenny zulassen (kein offener Redirect über //host oder /\host) */
export function safeTarget(to: string | null | undefined) {
	return to && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\') ? to : '/';
}
