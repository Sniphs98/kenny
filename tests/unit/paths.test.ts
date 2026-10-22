import { describe, expect, it } from 'vitest';
import { stripBase, withBase, withoutBase } from '#lib/paths.js';
import { safeTarget } from '#lib/safe-target.js';

describe('base path helpers', () => {
	it('leaves paths unchanged when served at the root', () => {
		expect(withBase('/tickets/WEB-1')).toBe('/tickets/WEB-1');
		expect(withoutBase('/tickets/WEB-1')).toBe('/tickets/WEB-1');
	});

	it('strips the base path only as a whole path segment', () => {
		expect(stripBase('/kenny', '/kenny')).toBe('/');
		expect(stripBase('/kenny/', '/kenny')).toBe('/');
		expect(stripBase('/kenny/login', '/kenny')).toBe('/login');
		expect(stripBase('/kennyx/login', '/kenny')).toBe('/kennyx/login');
		expect(stripBase('/other', '/kenny')).toBe('/other');
	});

	it('keeps redirect targets inside the app', () => {
		expect(safeTarget('/tickets/WEB-1?x=1')).toBe('/tickets/WEB-1?x=1');
		expect(safeTarget('//evil.example')).toBe('/');
		expect(safeTarget('/\\evil.example')).toBe('/');
		expect(safeTarget('https://evil.example')).toBe('/');
		expect(safeTarget(null)).toBe('/');
	});
});
