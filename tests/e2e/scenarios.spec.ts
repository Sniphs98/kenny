import { expect, test } from '@playwright/test';
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
		projects: scenario.projects?.map((p) => ({
			...p,
			key: `G${suffix}`.slice(0, 10),
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
