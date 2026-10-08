import type { Session } from '$lib/server/auth';
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
		}
	}
}

export {};
