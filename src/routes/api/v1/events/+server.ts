import { apiHandler } from '$lib/server/api';
import { requireActiveUser, requireProjectAccess } from '$lib/server/services/access';
import { ApiError } from '$lib/server/errors';
import { subscribe } from '$lib/server/live';
import { getProject } from '$lib/server/services/projects';

/** Lebenszeichen, damit Proxys die offene Verbindung nicht schließen */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events für Live-Updates: GET /api/v1/events (alle Projekte) oder ?project=KEY.
 * Jede Meldung ist ein Ereignis "change" mit { projectId, ticket?, kind, origin? } als JSON.
 */
export const GET = apiHandler((event, user) => {
	const ref = event.url.searchParams.get('project');
	const projectId = ref ? getProject(ref).id : null;
	if (projectId !== null) requireProjectAccess(user.id, projectId);
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
			const unsubscribe = subscribe(projectId, (e) => {
				try {
					requireProjectAccess(user.id, e.projectId);
				} catch (error) {
					if (error instanceof ApiError) return;
					throw error;
				}
				send(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
			});
			const heartbeat = setInterval(() => {
				try {
					requireActiveUser(user.id);
				} catch (error) {
					if (!(error instanceof ApiError)) throw error;
					cleanup();
					controller.close();
					return;
				}
				send(': ping\n\n');
			}, HEARTBEAT_MS);
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
