<script lang="ts">
	import '@toast-ui/editor/dist/toastui-editor.css';
	import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
	import type { Editor } from '@toast-ui/editor';
	import { upload } from '#lib/api.js';
	import { attachmentSchema } from '#lib/contracts/index.js';
	import { intlLocale } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { z } from 'zod';

	let { value = $bindable(), uploadCount = $bindable(0), ticketId, refresh, onSave, autoSave = true, placeholder }: {
		value: string;
		uploadCount: number;
		ticketId: number;
		refresh: () => Promise<void>;
		onSave: () => void;
		autoSave?: boolean;
		placeholder?: string;
	} = $props();
	let container: HTMLDivElement;
	let editor: Editor | undefined;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		if (!autoSave) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (!uploadCount) onSave();
		}, 800);
	}

	onMount(() => {
		let active = true;
		let observer: MutationObserver | undefined;
		(async () => {
			const [{ default: ToastEditor }] = await Promise.all([
				import('@toast-ui/editor'),
				import('@toast-ui/editor/dist/i18n/de-de')
			]);
			if (!active) return;
			editor = new ToastEditor({
				el: container,
				initialValue: value,
				initialEditType: 'wysiwyg',
				hideModeSwitch: true,
				height: 'auto',
				minHeight: '180px',
				placeholder: placeholder ?? m.add_description(),
				theme: document.documentElement.classList.contains('dark') ? 'dark' : undefined,
				language: intlLocale().startsWith('de') ? 'de-DE' : 'en-US',
				usageStatistics: false,
				toolbarItems: [
					['heading', 'bold', 'italic', 'strike'],
					['ul', 'ol', 'task'],
					['table', 'image', 'link'],
					['code', 'codeblock']
				],
				events: {
					change: () => {
						if (!editor) return;
						value = editor.getMarkdown();
						scheduleSave();
					},
					blur: () => {
						clearTimeout(saveTimer);
						if (autoSave && !uploadCount) onSave();
					}
				},
				hooks: {
					addImageBlobHook: (blob, callback) => {
						const file = blob instanceof File ? blob : new File([blob], 'image.png', { type: blob.type });
						if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(file.type)) {
							toast.error(m.unsupported_image_format());
							return false;
						}
						uploadCount++;
						void (async () => {
							try {
								const images = z.array(attachmentSchema).parse(await upload(`/tickets/${ticketId}/attachments`, [file]));
								const image = images.find((item) => item.isImage);
								if (image) callback(image.url, image.filename);
								await refresh();
							} catch (error) {
								toast.error((error as Error).message);
							} finally {
								uploadCount--;
								scheduleSave();
							}
						})();
						return false;
					}
				}
			});
			const updateTheme = () => container.querySelector('.toastui-editor-defaultUI')?.classList.toggle('toastui-editor-dark', document.documentElement.classList.contains('dark'));
			observer = new MutationObserver(updateTheme);
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
			updateTheme();
		})();
		return () => {
			active = false;
			clearTimeout(saveTimer);
			if (editor && editor.getMarkdown() !== value) value = editor.getMarkdown();
			if (autoSave && !uploadCount) onSave();
			observer?.disconnect();
			editor?.destroy();
		};
	});

	$effect(() => {
		if (editor && editor.getMarkdown() !== value) editor.setMarkdown(value);
	});
</script>

<div class="markdown-editor" bind:this={container} data-markdown-editor></div>

<style>
	.markdown-editor :global(.toastui-editor-defaultUI) {
		border: 0;
		border-radius: 0;
		background: var(--card);
	}
	.markdown-editor :global(.toastui-editor-toolbar) { height: 30px; }
	.markdown-editor :global(.toastui-editor-defaultUI-toolbar) {
		height: 30px;
		padding: 0 18px;
		border-bottom-color: var(--border);
		border-radius: 0;
		background: var(--card);
		overflow: visible;
	}
	.markdown-editor :global(.toastui-editor-defaultUI-toolbar button) {
		width: 32px;
		height: 32px;
		margin: -1px -2px;
		border-color: transparent;
		transform: scale(0.6);
	}
	.markdown-editor :global(.toastui-editor-toolbar-divider) {
		height: 14px;
		margin: 8px 5px;
		background: var(--border);
	}
	.markdown-editor :global(.toastui-editor-defaultUI-toolbar button:not(:disabled):hover) {
		border-color: var(--border);
		background-color: var(--muted);
	}
	.markdown-editor :global(.toastui-editor-main),
	.markdown-editor :global(.toastui-editor-ww-container) {
		background: var(--card);
	}
	.markdown-editor :global(.toastui-editor-contents) {
		color: var(--foreground);
		font-family: inherit;
		font-size: 0.875rem;
	}
	.markdown-editor :global(.toastui-editor-contents img) {
		max-width: 100%;
		max-height: 32rem;
		border-radius: 0.375rem;
	}
</style>
