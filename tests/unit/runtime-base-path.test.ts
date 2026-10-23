import { describe, expect, it } from 'vitest';
import { normalizeBasePath, stripBasePath } from '../../scripts/runtime-base-path.mjs';

describe('runtime base path', () => {
	it('normalizes empty values and trailing slashes', () => {
		expect(normalizeBasePath(undefined)).toBe('');
		expect(normalizeBasePath('')).toBe('');
		expect(normalizeBasePath('/')).toBe('');
		expect(normalizeBasePath('/kenny/')).toBe('/kenny');
		expect(normalizeBasePath(' /tools/kenny ')).toBe('/tools/kenny');
	});

	it.each(['kenny', '/ken ny', '/kenny/../admin', '/./kenny', '//kenny', '/kenny?x', 'https://example.com/kenny'])(
		'rejects %s',
		(value) => expect(() => normalizeBasePath(value)).toThrow(/BASE_PATH/)
	);

	it('maps requests below the base path to app paths', () => {
		expect(stripBasePath('/kenny/', '/kenny')).toBe('/');
		expect(stripBasePath('/kenny/projects/WEB/board?x=1', '/kenny')).toBe('/projects/WEB/board?x=1');
		expect(stripBasePath('/kenny?x=1', '/kenny')).toBe('/?x=1');
		expect(stripBasePath('/a/b/_app/env.js', '/a/b')).toBe('/_app/env.js');
	});

	it('rejects requests outside the base path', () => {
		expect(stripBasePath('/login', '/kenny')).toBeNull();
		expect(stripBasePath('/kennyx/login', '/kenny')).toBeNull();
	});

	it('keeps the prefix for Better Auth and leaves root deployments unchanged', () => {
		expect(stripBasePath('/kenny/api/auth/sign-in/email', '/kenny')).toBe('/kenny/api/auth/sign-in/email');
		expect(stripBasePath('/login?redirect=%2F', '')).toBe('/login?redirect=%2F');
	});
});
