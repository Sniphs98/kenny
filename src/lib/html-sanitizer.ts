import DOMPurify from 'dompurify';

/** Toast UI bundles an old sanitizer; use our maintained dependency for rendered HTML. */
export function sanitizeMarkdownHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ADD_ATTR: ['rel', 'target', 'hreflang', 'type'],
		FORBID_TAGS: [
			'input',
			'script',
			'textarea',
			'form',
			'button',
			'select',
			'meta',
			'style',
			'link',
			'title',
			'object',
			'base'
		]
	});
}
