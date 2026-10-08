<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	let open = $state(false);
	let name = $state('');
	let key = $state('');
	let description = $state('');
	let color = $state('#6366f1');
	let error = $state('');

	function openDialog() {
		name = key = description = error = '';
		color = '#6366f1';
		open = true;
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		try {
			const p = await api<{ key: string }>('POST', '/projects', {
				name,
				key: key || undefined,
				description,
				color
			});
			open = false;
			await goto(`/projects/${p.key}/board`, { invalidateAll: true });
		} catch (err) {
			error = (err as Error).message;
		}
	}
</script>

<div class="mx-auto max-w-6xl px-5 py-8">
	<div class="mb-6 flex items-end gap-4">
		<div class="grow">
			<h1 class="text-2xl font-semibold tracking-tight">Projekte</h1>
			<p class="text-muted-foreground mt-1 text-sm">Alle Projekte und ihr aktueller Fortschritt.</p>
		</div>
		<Button onclick={openDialog}><Plus /> Neues Projekt</Button>
	</div>

	{#if data.projects.length === 0}
		<Card.Root class="items-center px-6 py-12 text-center">
			<span class="bg-primary-soft text-primary grid size-12 place-items-center rounded-xl">
				<FolderKanban class="size-6" />
			</span>
			<div>
				<h2 class="text-lg font-semibold">Noch keine Projekte</h2>
				<p class="text-muted-foreground text-sm">Lege dein erstes Projekt an, um Tickets zu erfassen.</p>
			</div>
			<Button onclick={openDialog}><Plus /> Projekt anlegen</Button>
		</Card.Root>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
			{#each data.projects as p (p.id)}
				{@const done = p.total - p.open}
				<a href="/projects/{p.key}/board" class="group" style="--c: {p.color}">
					<Card.Root class="hover:border-foreground/25 h-full gap-4 py-5 transition-colors">
						<Card.Header class="flex items-center gap-3 px-5">
							<span
								class="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold"
								style="background: color-mix(in srgb, var(--c) 15%, transparent); color: var(--c)"
							>
								{p.key.slice(0, 2)}
							</span>
							<div class="min-w-0 grow">
								<Card.Title class="truncate">{p.name}</Card.Title>
								<div class="text-muted-foreground font-mono text-xs">{p.key}</div>
							</div>
							<ChevronRight class="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
						</Card.Header>
						{#if p.description}
							<Card.Content class="px-5">
								<p class="text-muted-foreground line-clamp-2">{p.description}</p>
							</Card.Content>
						{/if}
						<Card.Footer class="mt-auto flex-col items-stretch gap-1.5 px-5">
							<div class="text-muted-foreground flex text-xs">
								<span class="grow">{p.open} offen · {done} erledigt</span>
								{#if p.total > 0}<span>{Math.round((done / p.total) * 100)}%</span>{/if}
							</div>
							<div class="bg-muted h-1 overflow-hidden rounded-full">
								<div class="h-full rounded-full" style="width: {p.total ? (done / p.total) * 100 : 0}%; background: var(--c)"></div>
							</div>
						</Card.Footer>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" onsubmit={create}>
			<Dialog.Header>
				<Dialog.Title>Neues Projekt</Dialog.Title>
				<Dialog.Description>Tickets im Projekt bekommen das Kürzel als Präfix, z.B. WEB-1.</Dialog.Description>
			</Dialog.Header>
			<div class="flex gap-3">
				<div class="grid grow gap-2">
					<Label for="p-name">Name</Label>
					<Input id="p-name" bind:value={name} required maxlength={120} />
				</div>
				<div class="grid w-28 gap-2">
					<Label for="p-key">Kürzel</Label>
					<Input id="p-key" bind:value={key} placeholder="auto" maxlength={10} />
				</div>
			</div>
			<div class="grid gap-2">
				<Label>Farbe</Label>
				<ColorPicker bind:value={color} />
			</div>
			<div class="grid gap-2">
				<Label for="p-desc">Beschreibung</Label>
				<Textarea id="p-desc" bind:value={description} rows={3} />
			</div>
			{#if error}<p class="text-destructive text-sm">{error}</p>{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>Abbrechen</Button>
				<Button type="submit">Anlegen</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
