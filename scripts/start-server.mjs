import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizeBasePath, stripBasePath } from './runtime-base-path.mjs';
import { originHeaders } from './runtime-origin.mjs';

// Vite lädt .env in der Entwicklung. Beim gebauten Node-Server muss sie vor dem
// Server-Import geladen werden; bereits vom Host/Container gesetzte Variablen behalten Vorrang.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) loadEnvFile(envFile);

// Adapter-node 6 removed ORIGIN. Keep one image configurable at runtime, without trusting
// client-supplied forwarded headers or changing the adapter's startup/shutdown behavior.
const origin = process.env.ORIGIN || process.env.BETTER_AUTH_URL;
const headers = origin ? originHeaders(origin) : undefined;
if (headers) {
	process.env.PROTOCOL_HEADER = 'x-kenny-protocol';
	process.env.HOST_HEADER = 'x-kenny-host';
}
// Subpath behind a reverse proxy (e.g. /kenny), applied per request so one image serves any path
const basePath = normalizeBasePath(process.env.BASE_PATH);
const entry = new URL('../build/index.js', import.meta.url).href;
/** @type {{ server: import('node:http').Server }} */
const { server } = await import(entry);
if (headers) server.prependListener('request', (request) => Object.assign(request.headers, headers));
if (basePath) {
	const handlers = server.listeners('request');
	server.removeAllListeners('request');
	server.on('request', (request, response) => {
		const url = request.url ?? '/';
		// Relative asset paths need the trailing slash: /kenny → /kenny/
		if (url === basePath || url.startsWith(`${basePath}?`)) {
			response.writeHead(308, { location: `${basePath}/${url.slice(basePath.length)}` }).end();
			return;
		}
		const target = stripBasePath(url, basePath);
		if (target === null) {
			response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
			return;
		}
		request.url = target;
		for (const handler of handlers) handler.call(server, request, response);
	});
}
