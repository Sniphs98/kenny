import type { Session } from '#lib/server/auth.js';
import type { PageData as TicketPageData } from './routes/tickets/[key]/$types';

declare global {
	/** Base path from the BASE_PATH build variable, e.g. "/kenny"; empty when served at the root */
	const __KENNY_BASE_PATH__: string;

	namespace App {
		interface Locals {
			user?: Session['user'];
			session?: Session['session'];
		}
		interface PageState {
			/** Daten des im Modal geöffneten Tickets (Shallow Routing) */
			ticket?: TicketPageData;
			/** Anzahl der Verlaufseinträge, die das Modal belegt (Ticket → Unteraufgabe → …) */
			modalDepth?: number;
		}
	}
}

export {};
