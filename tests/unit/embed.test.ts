import { describe, expect, it } from 'vitest';
import { EMBED_RESIZE_MESSAGE, embedCode } from '$lib/embed';
import { isEmbeddable, protectFraming } from '$lib/server/framing';

describe('framing protection', () => {
	it('allows only submission pages inside foreign frames', () => {
		const submit = new Headers();
		protectFraming('/submit/abc', submit);
		expect([...submit.keys()]).toEqual([]);

		for (const path of ['/', '/login', '/settings/forms', '/projects/WEB/board', '/api/v1/projects', '/submitx']) {
			const headers = new Headers();
			protectFraming(path, headers);
			expect(headers.get('x-frame-options'), path).toBe('DENY');
			expect(headers.get('content-security-policy'), path).toBe("frame-ancestors 'none'");
		}
		expect(isEmbeddable('/submit/')).toBe(true);
	});

	it('extends an existing content security policy', () => {
		const headers = new Headers({ 'content-security-policy': "default-src 'none'; sandbox" });
		protectFraming('/api/v1/attachments/1', headers);
		expect(headers.get('content-security-policy')).toBe("default-src 'none'; sandbox; frame-ancestors 'none'");

		const own = new Headers({ 'content-security-policy': "frame-ancestors 'self'" });
		protectFraming('/', own);
		expect(own.get('content-security-policy')).toBe("frame-ancestors 'self'");
	});
});

describe('embed code', () => {
	it('builds an iframe with the embed link and a resize script bound to the origin', () => {
		const code = embedCode('https://kenny.example', 'tok_en-1', 'Support');
		expect(code).toContain('<iframe src="https://kenny.example/submit/tok_en-1?embed" title="Support"');
		expect(code).toContain(`e.origin !== "https://kenny.example"`);
		expect(code).toContain(`e.data.type !== '${EMBED_RESIZE_MESSAGE}'`);
	});

	it('escapes the form name', () => {
		const code = embedCode('https://kenny.example', 'abc', '"><script>alert(1)</script>');
		expect(code).toContain('title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
		expect(code.match(/<script>/g)).toHaveLength(1);
	});
});
