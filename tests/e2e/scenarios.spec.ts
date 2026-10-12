import { expect, test } from '@playwright/test';
import demo from '../../scenarios/demo.mjs';
import gantt from '../../scenarios/gantt.mjs';
import { day, seedScenario, type Scenario } from '../../scripts/scenario-seed.mjs';
import { api, getTicket } from './helpers';

/** Szenario mit eindeutigen E-Mails und Kürzeln, damit Wiederholungen nicht kollidieren */
function unique(scenario: Scenario): Scenario {
	const suffix = Date.now().toString(36).toUpperCase();
	const mail = (email: string) => email.replace('@', `+${suffix.toLowerCase()}@`);
	return {
		...scenario,
		users: scenario.users.map((u) => ({ ...u, email: mail(u.email) })),
		projects: scenario.projects?.map((p, index) => ({
			...p,
			key: `G${index}${suffix.slice(-8)}`,
			tickets: JSON.parse(
				JSON.stringify(p.tickets ?? []).replaceAll(
					/"([^"@]+)@example\.com"/g,
					(_, local) => `"${mail(`${local}@example.com`)}"`
				)
			)
		}))
	};
}

test('Szenario über die API befüllen', async ({ request, baseURL }) => {
	const scenario = unique(gantt);
	const key = scenario.projects![0].key;

	const result = await seedScenario(baseURL!, scenario);
	expect(result).toEqual({ users: 2, projects: 1, tickets: 12 });

	const tickets = await api<{ key: string; title: string; closed: boolean; startDate: string | null }[]>(
		request,
		'GET',
		`/projects/${key}/tickets`
	);
	expect(tickets).toHaveLength(12);
	const byTitle = new Map(tickets.map((t) => [t.title, t]));

	// Datumsangaben relativ zu heute, abgeschlossene Tickets geschlossen
	expect(byTitle.get('Konzept und Sitemap')).toMatchObject({ closed: true, startDate: day(-14) });
	expect(byTitle.get('Frontend umsetzen')).toMatchObject({ closed: false, startDate: day(3) });

	// Unteraufgaben, Zuständige und Abhängigkeiten
	const design = await getTicket(request, byTitle.get('Designsystem')!.key);
	expect(design.subtasks.map((s: { title: string; closed: boolean }) => [s.title, s.closed])).toEqual([
		['Farben und Typografie', true],
		['Komponentenbibliothek', false]
	]);
	expect(design.assignee?.email).toBe(scenario.users[1].email);
	expect(
		design.links.map((l: { relation: string; ticket: { title: string } }) => [l.relation, l.ticket.title])
	).toEqual(
		expect.arrayContaining([
			['depends_on', 'Konzept und Sitemap'],
			['blocks', 'Frontend umsetzen']
		])
	);
});

test('demo seeding preserves closed tickets and multipart attachments', async ({ request, baseURL }) => {
	const scenario = unique(demo);
	const result = await seedScenario(baseURL!, scenario);
	expect(result.users).toBe(3);
	expect(result.projects).toBe(2);
	const tickets = await api<{ key: string; title: string; closed: boolean }[]>(
		request,
		'GET',
		`/projects/${scenario.projects![0].key}/tickets`
	);
	expect(tickets.find((ticket) => ticket.title === 'Anhänge per Drag & Drop')).toMatchObject({ closed: true });
	const login = await getTicket(request, tickets.find((ticket) => ticket.title === 'Login mit Microsoft')!.key);
	expect(login.subtasks.find((ticket) => ticket.title === 'Callback-Route')).toMatchObject({ closed: true });
	expect(login.attachments.map((attachment) => attachment.filename)).toEqual(['ablauf.md', 'skizze.png']);
	const markdown = await request.get(login.attachments[0].url);
	expect(markdown.ok()).toBeTruthy();
	expect(await markdown.text()).toContain('# Login-Ablauf');
});
