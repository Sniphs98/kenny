/**
 * Kenny is built for the root path. Behind a reverse proxy it can run below a subpath such as /kenny:
 * the server strips BASE_PATH from incoming requests, SvelteKit's relative asset paths and client
 * router follow the browser URL, and links created by Kenny itself add BASE_PATH at runtime.
 */

/** Normalize BASE_PATH to "" or "/segment[/segment…]" without a trailing slash. @param {string | undefined} value */
export function normalizeBasePath(value) {
	const path = (value ?? '').trim().replace(/\/+$/, '');
	if (path === '') return '';
	const segments = path.split('/').slice(1);
	if (!/^(?:\/[A-Za-z0-9._~-]+)+$/.test(path) || segments.some((segment) => segment === '.' || segment === '..')) {
		throw new Error('BASE_PATH must be empty or a path such as /kenny (letters, digits, ".", "_", "~" and "-").');
	}
	return path;
}

/**
 * Map a request target below BASE_PATH to the app's root-relative target, or null when it lies outside.
 * Better Auth keeps the prefix: it is configured with the full public path to build its callback URLs.
 * @param {string} target request URL path and query, e.g. "/kenny/login?redirect=%2F"
 * @param {string} basePath normalized base path
 */
export function stripBasePath(target, basePath) {
	if (!basePath) return target;
	const rest = target.slice(basePath.length);
	if (!target.startsWith(basePath) || (rest !== '' && !/^[/?#]/.test(rest))) return null;
	if (rest.startsWith('/api/auth/')) return target;
	return rest.startsWith('/') ? rest : `/${rest}`;
}
