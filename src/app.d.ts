import type { Session } from '#lib/server/auth.js';
import type { PageData as TicketPageData } from './routes/tickets/[key]/$types';

declare global {
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
