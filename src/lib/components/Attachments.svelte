<script lang="ts">
	import { intlLocale } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { api, formatSize, upload } from '$lib/api';
	import type { AttachmentDto } from '$lib/contracts';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import Download from '@lucide/svelte/icons/download';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileIcon from '@lucide/svelte/icons/file';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';

	let {
		ticketId,
		attachments,
		refresh
	}: {
		ticketId: number;
		attachments: AttachmentDto[];
		/** Nach Hochladen oder Löschen die Ticketdaten neu laden */
		refresh: () => Promise<void>;
	} = $props();

	let input: HTMLInputElement;
	let uploading = $state(0);
	let dragOver = $state(false);
	let preview = $state<AttachmentDto | null>(null);
	let confirmDelete = $state<AttachmentDto | null>(null);

	const images = $derived(attachments.filter((a) => a.isImage));
	const files = $derived(attachments.filter((a) => !a.isImage));

	async function send(list: File[]) {
		if (!list.length) return;
		uploading = list.length;
		try {
			await upload(`/tickets/${ticketId}/attachments`, list);
			toast.success(
				list.length === 1 ? m.uploaded({ value1: list[0].name }) : m.uploaded_files({ value1: list.length })
			);
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			uploading = 0;
		}
	}

	async function remove(a: AttachmentDto) {
		try {
			await api('DELETE', `/attachments/${a.id}`);
			if (preview?.id === a.id) preview = null;
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		send([...(e.dataTransfer?.files ?? [])]);
	}

	/** Screenshots o.ä. per Strg+V einfügen */
	function onPaste(e: ClipboardEvent) {
		const pasted = [...(e.clipboardData?.files ?? [])];
		if (!pasted.length) return;
		e.preventDefault();
		// Screenshots heißen im Browser meist nur "image.png"
		const named = pasted.map((f, i) =>
			/^image\.\w+$/.test(f.name)
				? new File(
						[f],
						`Screenshot ${new Date().toLocaleString(intlLocale()).replace(/[/:]/g, '-')}${pasted.length > 1 ? ` (${i + 1})` : ''}.${f.name.split('.').pop()}`,
						{ type: f.type }
					)
				: f
		);
		send(named);
	}
</script>

<svelte:window onpaste={onPaste} />

<Card.Root
	class={cn('gap-4 transition-colors', dragOver && 'ring-primary bg-primary/5 ring-2')}
	ondragover={(e: DragEvent) => {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragOver = true;
	}}
	ondragleave={(e: DragEvent) => {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragOver = false;
	}}
	ondrop={onDrop}
>
	<Card.Header class="flex items-center gap-2">
		<Paperclip class="text-muted-foreground size-4" />
		<Card.Title class="grow">{m.attachments()}</Card.Title>
		{#if attachments.length}<Badge variant="secondary">{attachments.length}</Badge>{/if}
		<Button variant="ghost" size="sm" disabled={uploading > 0} onclick={() => input.click()}>
			{#if uploading}<LoaderCircle class="animate-spin" /> {m.uploading()}{:else}<Upload /> {m.upload()}{/if}
		</Button>
		<input
			bind:this={input}
			type="file"
			multiple
			class="hidden"
			onchange={(e) => {
				send([...(e.currentTarget.files ?? [])]);
				e.currentTarget.value = '';
			}}
		/>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if images.length}
			<div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
				{#each images as a (a.id)}
					<button
						type="button"
						class="group bg-muted focus-visible:ring-ring/50 relative aspect-[4/3] overflow-hidden rounded-md border outline-none focus-visible:ring-3"
						title={a.filename}
						onclick={() => (preview = a)}
					>
						<img
							src={a.url}
							alt={a.filename}
							loading="lazy"
							class="size-full object-cover transition-transform group-hover:scale-105"
						/>
						<span
							class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100"
						>
							{a.filename}
						</span>
					</button>
				{/each}
			</div>
		{/if}
		{#if files.length}
			<ul class="-mx-2 flex flex-col">
				{#each files as a (a.id)}
					<li class="hover:bg-muted flex items-center gap-2.5 rounded-md px-2 py-1.5">
						<FileIcon class="text-muted-foreground size-4 shrink-0" />
						<a href="{a.url}?download" class="min-w-0 grow truncate hover:underline" download={a.filename}
							>{a.filename}</a
						>
						<span class="text-muted-foreground shrink-0 text-xs">{formatSize(a.size)}</span>
						<Button
							variant="ghost"
							size="icon-xs"
							class="hover:text-destructive"
							title={m.delete_attachment()}
							aria-label={m.delete_attachment_2({ value1: a.filename })}
							onclick={() => (confirmDelete = a)}><Trash2 /></Button
						>
					</li>
				{/each}
			</ul>
		{/if}
		{#if !attachments.length}
			<button
				type="button"
				class="text-muted-foreground hover:border-foreground/30 hover:text-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors"
				onclick={() => input.click()}
			>
				{m.drop_files_here_paste_ctrl_v_or_click_to_select()}
			</button>
		{:else}
			<p class="text-muted-foreground text-xs">{m.drop_more_files_here_or_paste_with_ctrl_v()}</p>
		{/if}
	</Card.Content>
</Card.Root>

<Dialog.Root open={!!preview} onOpenChange={(o) => !o && (preview = null)}>
	<Dialog.Content class="sm:max-w-5xl">
		{#if preview}
			<Dialog.Header>
				<Dialog.Title class="truncate pr-8">{preview.filename}</Dialog.Title>
				<Dialog.Description>
					{formatSize(preview.size)}{#if preview.uploadedBy}
						· {preview.uploadedBy}{/if} · {new Date(preview.createdAt).toLocaleString(intlLocale())}
				</Dialog.Description>
			</Dialog.Header>
			<img src={preview.url} alt={preview.filename} class="bg-muted mx-auto max-h-[70vh] rounded-md object-contain" />
			<Dialog.Footer>
				<Button variant="ghost" class="hover:text-destructive mr-auto" onclick={() => (confirmDelete = preview)}
					><Trash2 /> {m.delete()}</Button
				>
				<a href={preview.url} target="_blank" rel="noopener" class={buttonVariants({ variant: 'outline' })}
					><ExternalLink /> {m.open_in_new_tab()}</a
				>
				<a href="{preview.url}?download" download={preview.filename} class={buttonVariants()}
					><Download /> {m.download()}</a
				>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={!!confirmDelete} onOpenChange={(o) => !o && (confirmDelete = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.delete_attachment_3()}</AlertDialog.Title>
			<AlertDialog.Description
				>{m.will_be_permanently_deleted({ value1: confirmDelete?.filename ?? '' })}</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				class="bg-destructive hover:bg-destructive/90 text-white"
				onclick={() => {
					const a = confirmDelete!;
					confirmDelete = null;
					remove(a);
				}}>{m.delete()}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
