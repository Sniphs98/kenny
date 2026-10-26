import type { TicketListItem } from '#lib/contracts/index.js';

type Dates = Pick<TicketListItem, 'startDate' | 'dueDate'>;
const DAY = 86_400_000;
const toDay = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);

export const isWeekendDay = (day: number) => [0, 6].includes(new Date(day * DAY).getUTCDay());

/** Return the next working day when planning begins on a weekend. */
export function nextWeekday(day: number) {
	while (isWeekendDay(day)) day++;
	return day;
}

/** Move an interval as little as possible until both ends fall on working days. */
export function weekdayRange(start: number, end: number) {
	for (let distance = 0; distance < 7; distance++) {
		for (const shift of distance === 0 ? [0] : [-distance, distance]) {
			if (!isWeekendDay(start + shift) && !isWeekendDay(end + shift)) return { start: start + shift, end: end + shift };
		}
	}
	return { start, end };
}

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
