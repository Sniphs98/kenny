import { expect, test } from '@playwright/test';
import { card, createProject, createTicket, getTicket, open } from './helpers';

test('Eine Aufgabe lässt sich in einen noch nicht angelegten Backlog ziehen', async ({ page, request }) => {
	const p = await createProject(request);
	const task = await createTicket(request, p.key, { title: 'Später prüfen' });

	await open(page, `/projects/${p.key}/board`);
	const backlog = page.getByRole('group', { name: 'Backlog' });
	await card(page, 'Später prüfen').dragTo(backlog);
	await expect.poll(async () => (await getTicket(request, task.key)).status).toBe('Backlog');
	await expect(backlog.getByText('Später prüfen')).toBeVisible();
});
