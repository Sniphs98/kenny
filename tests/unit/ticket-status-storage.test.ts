import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshStoredTicketStatuses, rememberTicketStatus, storedTicketStatuses } from '#lib/ticket-status-storage.js';

const values = new Map<string, string>();

beforeEach(() => {
	values.clear();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value)
	});
});

afterEach(() => vi.unstubAllGlobals());

describe('local ticket status history', () => {
	it('stores safe status links newest first and updates an existing ticket', () => {
		const firstPath = `/status/WEB-1/${'a'.repeat(43)}`;
		const updatedPath = `/status/WEB-1/${'b'.repeat(43)}`;
		rememberTicketStatus({ key: 'WEB-1', title: 'First title', path: firstPath });
		rememberTicketStatus({ key: 'APP-2', title: 'Second', path: `/status/APP-2/${'c'.repeat(43)}` });
		rememberTicketStatus({
			key: 'WEB-1',
			title: 'Updated title',
			path: updatedPath,
			status: 'In progress',
			closed: false,
			updatedAt: 1_798_000_000_000,
			projectName: 'Website',
			projectColor: '#3b82f6'
		});

		expect(storedTicketStatuses()).toMatchObject([
			{
				key: 'WEB-1',
				title: 'Updated title',
				path: updatedPath,
				status: 'In progress',
				updatedAt: 1_798_000_000_000,
				projectName: 'Website',
				projectColor: '#3b82f6'
			},
			{ key: 'APP-2', title: 'Second' }
		]);
	});

	it('ignores paths outside the public status route', () => {
		rememberTicketStatus({ key: 'WEB-1', title: 'Unsafe', path: 'https://example.com/status/WEB-1/token' });
		expect(storedTicketStatuses()).toEqual([]);
	});

	it('refreshes status and update time before returning saved tickets', async () => {
		const path = `/status/WEB-1/${'a'.repeat(43)}`;
		rememberTicketStatus({ key: 'WEB-1', title: 'Old title', path });
		const fetch = vi.fn().mockResolvedValue(
			Response.json({
				key: 'WEB-1',
				title: 'Current title',
				description: '',
				system: null,
				status: 'In progress',
				closed: false,
				createdAt: '2026-10-20T10:00:00.000Z',
				updatedAt: '2026-10-22T08:30:00.000Z',
				createdBy: null,
				assignees: [],
				tags: [],
				project: { name: 'Website', color: '#3b82f6' },
				comments: []
			})
		);
		vi.stubGlobal('fetch', fetch);

		const [current] = await refreshStoredTicketStatuses();

		expect(fetch).toHaveBeenCalledWith(`/api/v1${path}`);
		expect(current).toMatchObject({
			title: 'Current title',
			status: 'In progress',
			closed: false,
			updatedAt: new Date('2026-10-22T08:30:00.000Z').getTime(),
			projectName: 'Website',
			projectColor: '#3b82f6'
		});
	});
});
