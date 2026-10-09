import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { day, validateScenario, type Scenario, type ScenarioTicket } from '../../scripts/scenario-seed.mjs';

const names = readdirSync('scenarios')
	.filter((f) => f.endsWith('.mjs'))
	.map((f) => f.slice(0, -4));

const load = async (name: string): Promise<Scenario> => (await import(`../../scenarios/${name}.mjs`)).default;

const base = (tickets: ScenarioTicket[]): Scenario => ({
	description: 'Test',
	users: [{ name: 'Anna', email: 'anna@example.com' }],
	projects: [{ name: 'Test', key: 'TST', tickets }]
});

describe('scenarios', () => {
	it('ships the documented scenarios', () => {
		expect(names).toEqual(expect.arrayContaining(['leer', 'demo', 'gantt']));
	});

	it.each(names)('scenario %s is valid', async (name) => {
		const scenario = await load(name);
		expect(scenario.description).toBeTruthy();
		expect(validateScenario(scenario)).toEqual([]);
	});

	it('rejects broken references, columns, dates, assignees and tags', () => {
		const errors = validateScenario(
			base([
				{ ref: 'a', title: 'A', column: 'Gibt es nicht', start: 5, due: 1, assignee: 'fremd@example.com' },
				{ ref: 'a', title: 'B', tags: ['Unbekannt'], dependsOn: ['fehlt'], relatesTo: ['a'] }
			])
		);
		expect(errors).toEqual([
			'TST: Ticket-Ref "a" ist doppelt.',
			'TST „A“: Spalte "Gibt es nicht" gibt es nicht.',
			'TST „A“: Zuständige(r) fremd@example.com fehlt in users.',
			'TST „A“: Start liegt nach dem Fälligkeitsdatum.',
			'TST „B“: Tag "Unbekannt" fehlt.',
			'TST „B“: Verweis auf unbekanntes Ticket "fehlt".',
			'TST „B“: Ticket verweist auf sich selbst.'
		]);
	});

	it('checks references inside subtasks and project keys', () => {
		const scenario = base([{ title: 'Eltern', subtasks: [{ title: 'Kind', dependsOn: ['nirgends'] }] }]);
		scenario.projects!.push({ name: 'Doppelt', key: 'TST' }, { name: 'Falsch', key: '1X' });
		expect(validateScenario(scenario)).toEqual([
			'TST „Kind“: Verweis auf unbekanntes Ticket "nirgends".',
			'Projektkürzel TST ist doppelt.',
			'Projekt Falsch: Kürzel "1X" ist ungültig.'
		]);
	});

	it('requires at least one user and unique e-mails', () => {
		expect(validateScenario({ description: 'x', users: [] })).toEqual([
			'Mindestens ein Benutzer ist nötig (der erste wird zum Anmelden genutzt).'
		]);
		const user = { name: 'Anna', email: 'anna@example.com' };
		expect(validateScenario({ description: 'x', users: [user, user] })).toEqual([
			'Benutzer anna@example.com ist doppelt.'
		]);
	});

	it('resolves dates relative to today', () => {
		const today = new Date();
		const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
		expect(day(1)).toBe(
			`${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
		);
		expect(day(-3) < day(0)).toBe(true);
	});
});
