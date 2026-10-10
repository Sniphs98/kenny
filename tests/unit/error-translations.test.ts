import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paraglideMiddleware } from '../../src/lib/paraglide/server.js';
import { localizeError } from '../../src/lib/i18n';

// Fehlermeldungen entstehen serverseitig auf Deutsch (stabile Verträge) und werden erst in der
// Darstellung übersetzt. Jede Meldung, die Services, API-Routen, Formular-Aktionen oder Verträge
// erzeugen können, braucht deshalb eine Regel in src/lib/i18n.ts.
const roots = ['src/lib/server', 'src/lib/contracts', 'src/routes'];

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.ts$/.test(name) ? [path] : [];
	});
}

const literal = String.raw`(['\`])((?:\\.|(?!\1)[\s\S])*?)\1`;
const patterns = [
	// throw new ApiError(400, '…') – auch über mehrere Zeilen
	new RegExp(String.raw`new ApiError\(\s*\d+\s*,\s*` + literal, 'g'),
	// Zod: .min(1, '…'), .regex(/…/, '…'), refine(…, { message: '…' })
	new RegExp(String.raw`,\s*` + literal + String.raw`\s*\)`, 'g'),
	new RegExp(String.raw`message:\s*` + literal, 'g'),
	// Formular-Aktionen: fail(400, { error: '…' })
	new RegExp(String.raw`error:\s*` + literal, 'g'),
	// Meldungstabellen in Services: { description: 'Bitte …', … }
	new RegExp(String.raw`^\s*\w+:\s*` + literal + String.raw`,?\s*$`, 'gm')
];

/** Deutsche Sätze aus dem Quelltext; Platzhalter wie ${field} durch Beispielwerte ersetzt */
function serverMessages() {
	const found = new Map<string, string>();
	for (const file of roots.flatMap(files)) {
		const source = readFileSync(file, 'utf8');
		for (const pattern of patterns) {
			for (const match of source.matchAll(pattern)) {
				const text = match[2].replace(/\$\{[^}]+\}/g, 'X');
				// Nur Sätze (Großbuchstabe oder Anführungszeichen am Anfang, Punkt am Ende)
				if (/^["A-ZÄÖÜ]/.test(text) && /\.$/.test(text)) found.set(text, file);
			}
		}
	}
	return found;
}

describe('server error translations', () => {
	it('finds the known messages, including multi-line and template literals', () => {
		const messages = serverMessages();
		expect(messages.size).toBeGreaterThan(30);
		expect(
			messages.has('Entweder multipart/form-data mit Feld "file" oder ?filename=… mit der Datei als Body senden.')
		).toBe(true);
		expect(messages.has('Feld "X" ist erforderlich.')).toBe(true);
	});

	it('translates every server error message to English', async () => {
		const messages = serverMessages();
		const response = await paraglideMiddleware(
			new Request('http://localhost/', { headers: { 'accept-language': 'en' } }),
			async () => Response.json([...messages].filter(([text]) => localizeError(text) === text))
		);
		const untranslated = (await response.json()) as [string, string][];
		expect(untranslated.map(([text, file]) => `${file}: ${text}`)).toEqual([]);
	});
});
