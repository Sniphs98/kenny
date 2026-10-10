/** Seiten, die fremde Webseiten per iframe einbetten dürfen (Einbettungscode der Formulare) */
const EMBEDDABLE_PATHS = ['/submit/'];

export const isEmbeddable = (path: string) => EMBEDDABLE_PATHS.some((p) => path.startsWith(p));

/** Schutz vor Clickjacking: alles außer den Formularen darf nicht in fremden Seiten erscheinen */
export function protectFraming(path: string, headers: Headers) {
	if (isEmbeddable(path)) return;
	headers.set('x-frame-options', 'DENY');
	const csp = headers.get('content-security-policy');
	if (!csp) headers.set('content-security-policy', "frame-ancestors 'none'");
	else if (!/frame-ancestors/.test(csp)) headers.set('content-security-policy', `${csp}; frame-ancestors 'none'`);
}
