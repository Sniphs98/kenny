/** Unterpfad, unter dem Kenny läuft (z.B. "/kenny" hinter einem Reverse Proxy); leer an der Wurzel */
export const BASE_PATH: string = __KENNY_BASE_PATH__;

export type AppPath = `/${string}`;

export const isAppPath = (value: string): value is AppPath => value.startsWith('/');

/** Wurzelrelativen App-Pfad ("/tickets/WEB-1") um den Unterpfad ergänzen */
export function withBase(path: AppPath) {
	return `${BASE_PATH}${path}`;
}

/** Unterpfad von einem Pfadnamen entfernen, z.B. für Vergleiche mit Routen ("/kenny/login" → "/login") */
export function withoutBase(pathname: string) {
	return stripBase(pathname, BASE_PATH);
}

export function stripBase(pathname: string, base: string): AppPath {
	const path =
		base && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) || '/' : pathname;
	return isAppPath(path) ? path : '/';
}
