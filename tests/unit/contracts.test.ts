import { describe, expect, it } from 'vitest';
import {
	createProjectSchema,
	createTicketSchema,
	updateTicketSchema,
	createColumnSchema,
	ticketDtoSchema,
	isAllowedWebhookUrl,
	updateNotificationsSchema
} from '$lib/contracts';
import { parseInput } from '$lib/server/validation';
import { ApiError } from '$lib/server/errors';

describe('HTTP input contracts', () => {
	it('normalizes project names and keys without accepting internal fields', () => {
		expect(createProjectSchema.parse({ name: ' Example ', key: ' web ' })).toEqual({ name: 'Example', key: 'WEB' });
		expect(createProjectSchema.safeParse({ name: 'Example', ownerId: 'other-user' }).success).toBe(false);
	});
	it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-01-32', '10.10.2026'])(
		'rejects invalid calendar dates: %s',
		(startDate) => {
			expect(createTicketSchema.safeParse({ title: 'Test', startDate }).success).toBe(false);
		}
	);
	it('accepts leap days and checks the date range', () => {
		expect(createTicketSchema.safeParse({ title: 'Test', startDate: '2028-02-29' }).success).toBe(true);
		expect(
			createTicketSchema.safeParse({ title: 'Test', startDate: '2026-10-20', dueDate: '2026-10-10' }).success
		).toBe(false);
	});
	it('keeps absent PATCH fields absent and explicit nulls intact', () => {
		expect(updateTicketSchema.parse({ title: 'Changed' })).toEqual({ title: 'Changed' });
		expect(updateTicketSchema.parse({ startDate: null, assigneeId: null })).toEqual({
			startDate: null,
			assigneeId: null
		});
	});
	it.each([
		{ title: 'Test', priority: 'critical' },
		{ title: 'Test', projectId: 12 },
		{ title: 'Test', tags: [true] },
		{ title: 'Test', columnId: -1 },
		{ title: 'Test', position: 1.2 },
		{ title: 'Test', assigneeId: {} }
	])('rejects malformed or unexpected ticket fields: %j', (input) => {
		expect(createTicketSchema.safeParse(input).success).toBe(false);
	});
	it('rejects truthy strings instead of interpreting them as booleans', () => {
		expect(createColumnSchema.safeParse({ name: 'Done', isDone: 'false' }).success).toBe(false);
	});
	it('turns schema errors into client errors with a field path', () => {
		expect(() => parseInput(createTicketSchema, { title: '' })).toThrow(ApiError);
		expect(() => parseInput(createTicketSchema, { title: '' })).toThrow(/title/);
	});
	it('rejects incomplete API responses', () => {
		expect(ticketDtoSchema.safeParse({ id: 1, title: 'Incomplete' }).success).toBe(false);
	});
});

describe('notification contracts', () => {
	it('accepts only HTTPS addresses of Microsoft workflows', () => {
		expect(isAllowedWebhookUrl('https://prod-01.westeurope.logic.azure.com/workflows/x')).toBe(true);
		for (const value of ['kein Link', '', 'https://example.com/x', 'http://prod.logic.azure.com/x'])
			expect(isAllowedWebhookUrl(value), value).toBe(false);
		// Fehlende Felder bleiben unverändert, null entfernt die Einrichtung
		expect(updateNotificationsSchema.parse({})).toEqual({});
		expect(updateNotificationsSchema.parse({ webhookUrl: null }).webhookUrl).toBeNull();
		expect(updateNotificationsSchema.safeParse({ events: ['deleted'] }).success).toBe(false);
	});
});
