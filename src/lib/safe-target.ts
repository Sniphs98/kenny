import { isAppPath, type AppPath } from '#lib/paths.js';

/** Nur Ziele innerhalb von Kenny zulassen (kein offener Redirect über //host oder /\\host) */
export function safeTarget(to: string | null | undefined): AppPath {
	return to && isAppPath(to) && !to.startsWith('//') && !to.startsWith('/\\') ? to : '/';
}
