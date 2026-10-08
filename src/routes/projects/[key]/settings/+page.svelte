<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data } = $props();

	let name = $state('');
	let description = $state('');
	let color = $state('');
	$effect(() => {
		name = data.project.name;
		description = data.project.description;
		color = data.project.color;
	});
	let newColumn = $state('');
	let confirmDelete = $state(false);

	const base = $derived(`/projects/${data.project.key}`);

	async function run(fn: () => Promise<unknown>, success?: string) {
		try {
			await fn();
			await invalidateAll();
			if (success) toast.success(success);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		await run(() => api('PATCH', base, { name, description, color }), 'Projekt gespeichert');
	}

	async function addColumn(e: SubmitEvent) {
		e.preventDefault();
		if (!newColumn.trim()) return;
		await run(() => api('POST', `${base}/columns`, { name: newColumn }));
		newColumn = '';
	}

	async function remove() {
		await api('DELETE', base);
		toast.success(`Projekt „${data.project.name}“ gelöscht`);
		await goto('/', { invalidateAll: true });
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>Projekt</Card.Title>
			<Card.Description>Name, Farbe und Beschreibung des Projekts. Die Farbe wird im Projekt zur Hauptfarbe.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form class="grid gap-4" onsubmit={save}>
				<div class="grid gap-2">
					<Label for="name">Name</Label>
					<Input id="name" bind:value={name} required />
				</div>
				<div class="grid gap-2">
					<Label>Farbe</Label>
					<ColorPicker bind:value={color} />
				</div>
				<div class="grid gap-2">
					<Label for="desc">Beschreibung</Label>
					<Textarea id="desc" bind:value={description} rows={3} />
				</div>
				<div><Button type="submit">Speichern</Button></div>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Board-Spalten</Card.Title>
			<Card.Description>
				Tickets in Spalten mit „Erledigt“ gelten als abgeschlossen. Beim Schließen per API landet ein Ticket in
				der ersten Erledigt-Spalte.
			</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			<ul class="flex flex-col gap-2">
				{#each data.columns as col, i (col.id)}
					<li class="flex items-center gap-2">
						<Input
							value={col.name}
							onchange={(e) => run(() => api('PATCH', `${base}/columns/${col.id}`, { name: e.currentTarget.value }))}
						/>
						<Label class="shrink-0 px-2 font-normal">
							<Checkbox
								checked={col.isDone}
								onCheckedChange={(v) => run(() => api('PATCH', `${base}/columns/${col.id}`, { isDone: v }))}
							/>
							Erledigt
						</Label>
						<Button
							variant="ghost"
							size="icon"
							title="Nach oben"
							aria-label="Nach oben"
							disabled={i === 0}
							onclick={() => run(() => api('PATCH', `${base}/columns/${col.id}`, { position: i - 1 }))}><ArrowUp /></Button
						>
						<Button
							variant="ghost"
							size="icon"
							title="Nach unten"
							aria-label="Nach unten"
							disabled={i === data.columns.length - 1}
							onclick={() => run(() => api('PATCH', `${base}/columns/${col.id}`, { position: i + 1 }))}><ArrowDown /></Button
						>
						<Button
							variant="ghost"
							size="icon"
							class="hover:text-destructive"
							title="Spalte löschen"
							aria-label="Spalte löschen"
							onclick={() => run(() => api('DELETE', `${base}/columns/${col.id}`))}><Trash2 /></Button
						>
					</li>
				{/each}
			</ul>
			<form class="flex gap-2" onsubmit={addColumn}>
				<Input placeholder="Neue Spalte" bind:value={newColumn} />
				<Button type="submit" variant="outline"><Plus /> Hinzufügen</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root class="ring-destructive/30">
		<Card.Header class="flex items-center gap-4">
			<div class="grow">
				<Card.Title>Projekt löschen</Card.Title>
				<Card.Description>Löscht das Projekt mit allen Tickets endgültig.</Card.Description>
			</div>
			<Button variant="destructive" onclick={() => (confirmDelete = true)}><Trash2 /> Löschen</Button>
		</Card.Header>
	</Card.Root>
</div>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Projekt „{data.project.name}“ löschen?</AlertDialog.Title>
			<AlertDialog.Description>
				Das Projekt und alle {data.tickets.length} Tickets werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Abbrechen</AlertDialog.Cancel>
			<AlertDialog.Action class="bg-destructive hover:bg-destructive/90 text-white" onclick={remove}>Endgültig löschen</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
