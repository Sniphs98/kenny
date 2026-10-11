import { describe, expect, it } from 'vitest';
import { originHeaders } from '../../scripts/runtime-origin.mjs';

describe('runtime public origin', () => {
	it('preserves HTTP, HTTPS and non-default ports for the adapter', () => {
		expect(originHeaders('http://localhost:4174')).toEqual({
			'x-kenny-protocol': 'http',
			'x-kenny-host': 'localhost:4174'
		});
		expect(originHeaders('https://kenny.example.com/')).toEqual({
			'x-kenny-protocol': 'https',
			'x-kenny-host': 'kenny.example.com'
		});
	});
	it.each([
		'relative',
		'ftp://example.com',
		'https://user:password@example.com',
		'https://example.com/path',
		'https://example.com?x=1',
		'https://example.com#fragment'
	])('rejects non-origin configuration: %s', (value) => {
		expect(() => originHeaders(value)).toThrow('ORIGIN must be an absolute HTTP or HTTPS origin.');
	});
});
