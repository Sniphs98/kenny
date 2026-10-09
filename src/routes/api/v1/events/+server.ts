import { apiHandler } from '$lib/server/api';
import { subscribe } from '$lib/server/live';
import { getProject } from '$lib/server/services/projects';

/** Lebenszeichen, damit Proxys die offene Verbindung nicht schließen */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events für Live-Updates: GET /api/v1/events (alle Projekte) oder ?project=KEY.
 * Jede Meldung ist ein Ereignis "change" mit { projectId, ticket?, kind, origin? } als JSON.
 */
export const GET = apiHandler((event) => {
	const ref = event.url.searchParams.get('project');
	const projectId = ref ? getProject(ref).id : null;
	const encoder = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (text: string) => {
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					cleanup();
				}
			};
			// Bei Abbruch nach 3 s neu verbinden
			send('retry: 3000\n: verbunden\n\n');
			const unsubscribe = subscribe(projectId, (e) => send(`event: change\ndata: ${JSON.stringify(e)}\n\n`));
			const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
			cleanup = () => {
				clearInterval(heartbeat);
				unsubscribe();
			};
			event.request.signal.addEventListener('abort', () => {
				cleanup();
				try {
					controller.close();
				} catch {
					// schon geschlossen
				}
			});
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			// nginx & Co. sollen den Stream nicht puffern
			'x-accel-buffering': 'no'
		}
	});
});
