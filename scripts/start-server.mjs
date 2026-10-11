import { originHeaders } from './runtime-origin.mjs';

// Adapter-node 6 removed ORIGIN. Keep one image configurable at runtime, without trusting
// client-supplied forwarded headers or changing the adapter's startup/shutdown behavior.
const origin = process.env.ORIGIN || process.env.BETTER_AUTH_URL;
const headers = origin ? originHeaders(origin) : undefined;
if (headers) {
	process.env.PROTOCOL_HEADER = 'x-kenny-protocol';
	process.env.HOST_HEADER = 'x-kenny-host';
}
const entry = new URL('../build/index.js', import.meta.url).href;
/** @type {{ server: import('node:http').Server }} */
const { server } = await import(entry);
if (headers) server.prependListener('request', (request) => Object.assign(request.headers, headers));
