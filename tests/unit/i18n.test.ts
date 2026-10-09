import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import { m } from '../../src/lib/paraglide/messages.js';
import { paraglideMiddleware } from '../../src/lib/paraglide/server.js';
import { PRIORITY_LABELS, formatSize } from '../../src/lib/api';
import { intlLocale, localizeError } from '../../src/lib/i18n';

describe('localization', () => {
	it('keeps both catalogs complete with matching interpolation parameters', () => {
		expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
		for (const key of Object.keys(de) as (keyof typeof de)[]) {
			expect(en[key].trim(), key).not.toBe('');
			const parameters = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
			expect(parameters(en[key]), key).toEqual(parameters(de[key]));
		}
	});

	it('isolates concurrent request locales, including priorities, numbers and validation errors', async () => {
		const run = (locale: string) =>
			paraglideMiddleware(
				new Request('http://localhost/login', { headers: { cookie: `PARAGLIDE_LOCALE=${locale}` } }),
				async () => {
					await new Promise((resolve) => setTimeout(resolve, 5));
					return Response.json({
						projects: m.projects(),
						priority: PRIORITY_LABELS.high,
						size: formatSize(1536),
						locale: intlLocale(),
						error: localizeError('name: Bitte einen Namen angeben.'),
						duplicate: localizeError('Kürzel "WEB" ist bereits vergeben.')
					});
				}
			);
		const [german, english] = await Promise.all([run('de'), run('en')]);
		expect(await german.json()).toEqual({
			projects: 'Projekte',
			priority: 'Hoch',
			size: '1,5 KB',
			locale: 'de-DE',
			error: 'name: Bitte einen Namen angeben.',
			duplicate: 'Kürzel "WEB" ist bereits vergeben.'
		});
		expect(await english.json()).toEqual({
			projects: 'Projects',
			priority: 'High',
			size: '1.5 KB',
			locale: 'en-GB',
			error: 'name: Enter a name.',
			duplicate: 'Key “WEB” is already taken.'
		});
	});
});
