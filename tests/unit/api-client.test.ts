import { afterEach, expect, it, vi } from 'vitest';
import { closeTicket, createTicket, reopenTicket, updateTicket } from '$lib/api';

afterEach(() => vi.unstubAllGlobals());

it('validates outgoing input before sending a request', async () => {
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	await expect(createTicket('WEB', { title: '' })).rejects.toThrow();
	expect(fetch).not.toHaveBeenCalled();
});
it('validates successful responses instead of asserting an arbitrary type', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 1 })));
	await expect(updateTicket('WEB-1', { title: 'Changed' })).rejects.toThrow();
});
it('preserves the server error message', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Ticket fehlt' }, { status: 404 })));
	await expect(updateTicket('WEB-1', { title: 'Changed' })).rejects.toThrow('Ticket fehlt');
});
it('validates close and reopen responses', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ closed: true })));
	await expect(closeTicket('WEB-1')).rejects.toThrow();
	await expect(reopenTicket('WEB-1')).rejects.toThrow();
});
