import type { TicketListItem } from '#lib/contracts/index.js';

type Dates = Pick<TicketListItem, 'startDate' | 'dueDate'>;
const DAY = 86_400_000;
const toDay = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);

/** A deadline alone is not a scheduled interval. */
export function ganttSpan(ticket: Dates) {
	if (!ticket.startDate) return null;
	return { start: toDay(ticket.startDate), end: toDay(ticket.dueDate ?? ticket.startDate) };
}

/** Preserve standalone deadlines; shift an existing schedule with its duration. */
export function planningDates(ticket: Dates, startDate: string) {
	if (!ticket.startDate && ticket.dueDate) return { startDate, dueDate: ticket.dueDate };
	const span = ganttSpan(ticket);
	const duration = span ? span.end - span.start : 2;
	return { startDate, dueDate: new Date((toDay(startDate) + duration) * DAY).toISOString().slice(0, 10) };
}
