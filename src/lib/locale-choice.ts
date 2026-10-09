// Bewusst gewählte Sprache des Benutzers als eigene Paraglide-Strategie.
//
// Paraglides eingebaute Cookie-Strategie schreibt beim ersten Laden die ermittelte Sprache
// automatisch in den Cookie. Damit würde „Systemsprache“ nach dem ersten Besuch eingefroren.
// Diese Strategie liest den Cookie nur; geschrieben wird er ausschließlich über chooseLocale().
// Reihenfolge siehe strategy in vite.config.ts: Wahl → Systemsprache → Englisch.
import {
	cookieMaxAge,
	cookieName,
	defineCustomClientStrategy,
	defineCustomServerStrategy,
	isLocale,
	type Locale
} from '$lib/paraglide/runtime.js';

const pattern = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`);

function fromCookies(cookies: string | null | undefined): Locale | undefined {
	const value = cookies?.match(pattern)?.[1];
	return isLocale(value) ? value : undefined;
}

defineCustomServerStrategy('custom-choice', {
	getLocale: (request) => fromCookies(request?.headers.get('cookie'))
});

defineCustomClientStrategy('custom-choice', {
	getLocale: () => (typeof document === 'undefined' ? undefined : fromCookies(document.cookie)),
	// Absichtlich leer: Paraglide ruft setLocale auch beim ersten Ermitteln der Sprache auf
	setLocale: () => {}
});

/** Gespeicherte Wahl oder 'system', wenn der Systemsprache gefolgt wird */
export function storedLocale(): Locale | 'system' {
	return (typeof document === 'undefined' ? undefined : fromCookies(document.cookie)) ?? 'system';
}

/** Sprache speichern (oder mit 'system' die Wahl entfernen) und neu laden */
export function chooseLocale(locale: Locale | 'system') {
	document.cookie =
		locale === 'system'
			? `${cookieName}=; path=/; max-age=0; samesite=lax`
			: `${cookieName}=${locale}; path=/; max-age=${cookieMaxAge}; samesite=lax`;
	location.reload();
}
