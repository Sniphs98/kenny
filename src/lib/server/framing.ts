/** Seiten, die fremde Webseiten per iframe einbetten dürfen (Einbettungscode der Formulare) */
const EMBEDDABLE_PATHS = ['/submit/'];

export const isEmbeddable = (path: string) => EMBEDDABLE_PATHS.some((p) => path.startsWith(p));

/**
 * Schutz vor Clickjacking: alles außer den Formularen darf nicht in fremden Seiten erscheinen.
 * Mit `frameAncestors` (Teams-Modus) dürfen genau diese Hosts die App einbetten, sonst niemand.
 */
export function protectFraming(path: string, headers: Headers, frameAncestors: string[] = []) {
	if (isEmbeddable(path)) return;
	const directive = frameAncestors.length
		? `frame-ancestors 'self' ${frameAncestors.join(' ')}`
		: "frame-ancestors 'none'";
	// X-Frame-Options kennt keine Liste erlaubter Hosts und würde Teams sperren; den Schutz übernimmt frame-ancestors
	if (frameAncestors.length) headers.delete('x-frame-options');
	else headers.set('x-frame-options', 'DENY');
	const csp = headers.get('content-security-policy');
	if (!csp) headers.set('content-security-policy', directive);
	else if (!/frame-ancestors/.test(csp)) headers.set('content-security-policy', `${csp}; ${directive}`);
}
