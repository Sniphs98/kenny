import { describe, expect, it } from 'vitest';
import { ganttSpan, planningDates } from '#lib/schedule.js';

describe('Gantt dates', () => {
	it('does not turn a standalone deadline into a scheduled interval', () => {
		expect(ganttSpan({ startDate: null, dueDate: '2026-10-20' })).toBeNull();
	});
	it('keeps a start-only ticket as a one-day interval', () => {
		const span = ganttSpan({ startDate: '2026-10-12', dueDate: null });
		expect(span?.end).toBe(span?.start);
		expect(span).not.toBeNull();
	});
	it('preserves a standalone deadline even if the requested start would be invalid', () => {
		expect(planningDates({ startDate: null, dueDate: '2026-10-20' }, '2026-10-12')).toEqual({
			startDate: '2026-10-12',
			dueDate: '2026-10-20'
		});
		expect(planningDates({ startDate: null, dueDate: '2026-10-10' }, '2026-10-12').dueDate).toBe('2026-10-10');
	});
	it('keeps the duration when moving a schedule across a month boundary', () => {
		expect(planningDates({ startDate: '2026-01-01', dueDate: '2026-01-05' }, '2026-01-30')).toEqual({
			startDate: '2026-01-30',
			dueDate: '2026-02-03'
		});
	});
	it('retains the two-day default for tickets without any dates', () => {
		expect(planningDates({ startDate: null, dueDate: null }, '2026-01-30')).toEqual({
			startDate: '2026-01-30',
			dueDate: '2026-02-01'
		});
	});
});
