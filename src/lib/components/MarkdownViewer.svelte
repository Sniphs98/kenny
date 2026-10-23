<script lang="ts">
	import { sanitizeMarkdownHtml } from '#lib/html-sanitizer.js';
	import '@toast-ui/editor/dist/toastui-editor-viewer.css';
	import { onMount } from 'svelte';
	import type { Viewer } from '@toast-ui/editor';
	import { BASE_PATH } from '#lib/paths.js';

	let { value }: { value: string } = $props();
	let container: HTMLDivElement;
	let viewer = $state<Viewer | undefined>();

	/** Vor einem Umzug unter einen Unterpfad gespeicherte Beschreibungen verweisen noch auf /api/v1/attachments/… */
	function prefixLegacyAttachmentUrls() {
		if (!BASE_PATH) return;
		const legacy = 'img[src^="/api/v1/attachments/"], a[href^="/api/v1/attachments/"]';
		for (const element of container.querySelectorAll(legacy)) {
			const attribute = element instanceof HTMLImageElement ? 'src' : 'href';
			element.setAttribute(attribute, BASE_PATH + element.getAttribute(attribute));
		}
	}

	onMount(() => {
		let active = true;
		import('@toast-ui/editor/dist/toastui-editor-viewer').then(({ default: ToastViewer }) => {
			if (!active) return;
			viewer = new ToastViewer({
				el: container,
				initialValue: value,
				usageStatistics: false,
				customHTMLSanitizer: sanitizeMarkdownHtml
			});
			prefixLegacyAttachmentUrls();
		});
		return () => {
			active = false;
			viewer?.destroy();
		};
	});

	$effect(() => {
		if (!viewer) return;
		viewer.setMarkdown(value);
		prefixLegacyAttachmentUrls();
	});
</script>

<div bind:this={container} class="markdown-viewer break-words [overflow-wrap:anywhere]"></div>

<style>
	.markdown-viewer :global(.toastui-editor-contents) {
		color: var(--foreground);
		font-family: inherit;
		font-size: 0.875rem;
	}
	/* Toast UI setzt für viele Elemente feste dunkle Farben; diese müssen dem App-Theme folgen. */
	.markdown-viewer :global(.toastui-editor-contents p),
	.markdown-viewer :global(.toastui-editor-contents h1),
	.markdown-viewer :global(.toastui-editor-contents h2),
	.markdown-viewer :global(.toastui-editor-contents h3),
	.markdown-viewer :global(.toastui-editor-contents h4),
	.markdown-viewer :global(.toastui-editor-contents h5),
	.markdown-viewer :global(.toastui-editor-contents h6),
	.markdown-viewer :global(.toastui-editor-contents li),
	.markdown-viewer :global(.toastui-editor-contents td),
	.markdown-viewer :global(.toastui-editor-contents table) {
		color: var(--foreground);
	}
	.markdown-viewer :global(.toastui-editor-contents h1),
	.markdown-viewer :global(.toastui-editor-contents h2) {
		border-color: var(--border);
	}
	.markdown-viewer :global(.toastui-editor-contents blockquote),
	.markdown-viewer :global(.toastui-editor-contents blockquote p),
	.markdown-viewer :global(.toastui-editor-contents blockquote ul),
	.markdown-viewer :global(.toastui-editor-contents blockquote ol) {
		border-color: var(--border);
		color: var(--muted-foreground);
	}
	.markdown-viewer :global(.toastui-editor-contents table),
	.markdown-viewer :global(.toastui-editor-contents table th),
	.markdown-viewer :global(.toastui-editor-contents table td) {
		border-color: var(--border);
	}
	.markdown-viewer :global(.toastui-editor-contents table th) {
		background: var(--muted);
		color: var(--foreground);
	}
	.markdown-viewer :global(.toastui-editor-contents th p) {
		color: var(--foreground);
	}
	.markdown-viewer :global(.toastui-editor-contents a) {
		color: var(--primary);
	}
	.markdown-viewer :global(.toastui-editor-contents code),
	.markdown-viewer :global(.toastui-editor-contents pre) {
		background: var(--muted);
		color: var(--foreground);
	}
	.markdown-viewer :global(.toastui-editor-contents img) {
		max-width: 100%;
		max-height: 32rem;
		border-radius: 0.375rem;
	}
</style>
