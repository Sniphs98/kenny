import { expect, test } from '@playwright/test';
import { api, createProject, createTicket, open } from './helpers';

test('Markdown editor and viewer keep formatting while removing executable HTML', async ({ page, request }) => {
	const project = await createProject(request);
	const markdown = [
		'**Safe formatting**',
		'',
		'[Safe link](https://example.com)',
		'',
		'<img src="/missing-sanitizer-test.png" onerror="document.documentElement.dataset.markdownXss=\'yes\'">',
		'',
		'<a href="javascript:document.documentElement.dataset.markdownXss=\'yes\'">Unsafe link</a>',
		'',
		'<script>document.documentElement.dataset.markdownXss="yes"</script>'
	].join('\n');
	const ticket = await createTicket(request, project.key, { title: 'Markdown sanitization', description: markdown });
	await api(request, 'POST', `/tickets/${ticket.key}/comments`, { body: markdown });
	await open(page, `/tickets/${ticket.key}`);

	for (const contents of [
		page.locator('.toastui-editor-ww-container .toastui-editor-contents').first(),
		page.locator('article .markdown-viewer .toastui-editor-contents').first()
	]) {
		await expect(contents.locator('strong')).toHaveText('Safe formatting');
		await expect(contents.getByRole('link', { name: 'Safe link', exact: true })).toHaveAttribute(
			'href',
			'https://example.com'
		);
		await expect(contents.locator('script, [onerror], [onclick], a[href^="javascript:"]')).toHaveCount(0);
	}
	await expect(page.locator('html')).not.toHaveAttribute('data-markdown-xss', 'yes');
});
