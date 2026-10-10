import { describe, expect, it } from 'vitest';
import { highlight, searchTokens, snippet } from '$lib/search';

const render = (parts: { text: string; hit: boolean }[] | null) =>
	parts?.map((p) => (p.hit ? `[${p.text}]` : p.text)).join('') ?? null;

describe('search helpers', () => {
	it('splits the query into unique lower-case words', () => {
		expect(searchTokens('  Rechnung   PDF rechnung ')).toEqual(['rechnung', 'pdf']);
		expect(searchTokens('')).toEqual([]);
	});

	it('marks every word regardless of case without interpreting regex characters', () => {
		expect(render(highlight('Rechnung als PDF exportieren', ['pdf', 'rechnung']))).toBe(
			'[Rechnung] als [PDF] exportieren'
		);
		expect(render(highlight('Preis (netto) + 19 %', ['(netto)', '+']))).toBe('Preis [(netto)] [+] 19 %');
		expect(render(highlight('Login', ['log', 'login']))).toBe('[Login]');
		expect(highlight('', ['x'])).toEqual([]);
		expect(highlight('Titel', [])).toEqual([{ text: 'Titel', hit: false }]);
	});

	it('cuts a short excerpt around the first word at word boundaries', () => {
		const text = `Einleitung ${'Füllwort '.repeat(12)}hier steht der Fehler beim Login\n\nund danach ${'noch mehr Text '.repeat(10)}`;
		const excerpt = render(snippet(text, ['login'], 30))!;
		expect(excerpt.startsWith('… ')).toBe(true);
		expect(excerpt.endsWith(' …')).toBe(true);
		expect(excerpt).toContain('Fehler beim [Login] und danach');
		expect(excerpt).not.toMatch(/\n/);
		// Kurzer Text bleibt ganz, ohne Auslassungszeichen
		expect(render(snippet('Nur der Login', ['login']))).toBe('Nur der [Login]');
		expect(snippet('Nichts davon', ['login'])).toBeNull();
	});
});
