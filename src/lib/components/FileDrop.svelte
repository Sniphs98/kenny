<script lang="ts">
	import { onDestroy } from 'svelte';
	import { intlLocale } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { formatSize } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import FileIcon from '@lucide/svelte/icons/file';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';

	/**
	 * Dateiauswahl für normale Formulare: Ziehen, Einfügen (Strg+V) oder Auswählen,
	 * mit Vorschau und Entfernen vor dem Absenden. Die Dateien landen im versteckten
	 * Feld `name` und werden mit dem Formular übertragen.
	 */
	let { name, id, max }: { name: string; id?: string; max: number } = $props();

	type Item = { file: File; url: string | null };

	let items = $state<Item[]>([]);
	let input: HTMLInputElement;
	let picker: HTMLInputElement;
	let dragOver = $state(false);
	let tooMany = $state(false);

	/** Ausgewählte Dateien in das Formularfeld übernehmen */
	function sync() {
		const dt = new DataTransfer();
		for (const i of items) dt.items.add(i.file);
		input.files = dt.files;
	}

	function add(list: File[]) {
		if (!list.length) return;
		const room = max - items.length;
		tooMany = list.length > room;
		const added = list.slice(0, Math.max(room, 0)).map((file) => ({
			file,
			url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
		}));
		items = [...items, ...added];
		sync();
	}

	function remove(item: Item) {
		if (item.url) URL.revokeObjectURL(item.url);
		items = items.filter((i) => i !== item);
		tooMany = false;
		sync();
	}

	onDestroy(() => items.forEach((i) => i.url && URL.revokeObjectURL(i.url)));

	/** Screenshots o.ä. per Strg+V einfügen; Text einfügen bleibt unverändert */
	function onPaste(e: ClipboardEvent) {
		const pasted = [...(e.clipboardData?.files ?? [])];
		if (!pasted.length) return;
		e.preventDefault();
		// Screenshots heißen im Browser meist nur "image.png"
		add(
			pasted.map((f, i) =>
				/^image\.\w+$/.test(f.name)
					? new File(
							[f],
							`Screenshot ${new Date().toLocaleString(intlLocale()).replace(/[/:]/g, '-')}${pasted.length > 1 ? ` (${i + 1})` : ''}.${f.name.split('.').pop()}`,
							{ type: f.type }
						)
					: f
			)
		);
	}
</script>

<svelte:window onpaste={onPaste} />

<div
	role="group"
	aria-label={m.attachments()}
	class={cn('grid gap-2 rounded-lg transition-colors', dragOver && 'ring-primary bg-primary/5 ring-2')}
	ondragover={(e) => {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragOver = true;
	}}
	ondragleave={(e) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node)) dragOver = false;
	}}
	ondrop={(e) => {
		e.preventDefault();
		dragOver = false;
		add([...(e.dataTransfer?.files ?? [])]);
	}}
>
	<!-- Wird mit dem Formular übertragen -->
	<input bind:this={input} {name} type="file" multiple class="hidden" tabindex="-1" aria-hidden="true" />
	<!-- Auswahldialog; fügt hinzu statt zu ersetzen -->
	<input
		bind:this={picker}
		{id}
		type="file"
		multiple
		class="hidden"
		onchange={(e) => {
			add([...(e.currentTarget.files ?? [])]);
			e.currentTarget.value = '';
		}}
	/>
	{#if items.length}
		<ul class="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2" data-file-list>
			{#each items as item (item)}
				<li class="bg-muted relative aspect-square overflow-hidden rounded-md border">
					{#if item.url}
						<img src={item.url} alt={item.file.name} class="size-full object-cover" />
					{:else}
						<div class="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
							<FileIcon class="text-muted-foreground size-6" />
							<span class="text-muted-foreground text-[11px]">{formatSize(item.file.size)}</span>
						</div>
					{/if}
					<span class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[11px] text-white"
						>{item.file.name}</span
					>
					<Button
						variant="secondary"
						size="icon-xs"
						class="absolute top-1 right-1 rounded-full shadow"
						aria-label={m.remove_file({ name: item.file.name })}
						onclick={() => remove(item)}><X /></Button
					>
				</li>
			{/each}
		</ul>
	{/if}
	{#if items.length < max}
		<button
			type="button"
			class="text-muted-foreground hover:border-foreground/30 hover:text-foreground flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors"
			onclick={() => picker.click()}
		>
			<Upload class="size-4 shrink-0" />
			{items.length
				? m.drop_more_files_here_or_paste_with_ctrl_v()
				: m.drop_files_here_paste_ctrl_v_or_click_to_select()}
		</button>
	{/if}
	{#if tooMany}<p class="text-destructive text-sm" role="alert">{m.at_most_files({ count: String(max) })}</p>{/if}
</div>
