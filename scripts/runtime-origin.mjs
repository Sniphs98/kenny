/** Convert the configured public origin into internal adapter headers. @param {string} value */
export function originHeaders(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error('ORIGIN must be an absolute HTTP or HTTPS origin.');
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.pathname !== '/' ||
		url.search ||
		url.hash
	) {
		throw new Error('ORIGIN must be an absolute HTTP or HTTPS origin.');
	}
	return { 'x-kenny-protocol': url.protocol.slice(0, -1), 'x-kenny-host': url.host };
}
