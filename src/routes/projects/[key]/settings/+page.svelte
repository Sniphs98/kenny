<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, updateProject } from '$lib/api';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import TagColorButton from '$lib/components/TagColorButton.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
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
	let newTag = $state('');
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
		await run(() => updateProject(data.project.key, { name, description, color }), 'Projekt gespeichert');
	}

	// --- Spalten per Drag & Drop sortieren (nur am Griff, damit die Eingabefelder bedienbar bleiben) ---
	let columns = $state<typeof data.columns>([]);
	$effect(() => {
		columns = [...data.columns];
	});
	/** Spalte, deren Griff gerade gedrückt ist; nur diese Zeile ist ziehbar */
	let armedId = $state<number | null>(null);
	let dragId = $state<number | null>(null);

	function onDragOver(e: DragEvent, overId: number) {
		if (dragId === null) return;
		e.preventDefault();
		if (overId === dragId) return;
		// Vorschau: gezogene Spalte sofort an die neue Stelle setzen
		const from = columns.findIndex((c) => c.id === dragId);
		const to = columns.findIndex((c) => c.id === overId);
		const [moved] = columns.splice(from, 1);
		columns.splice(to, 0, moved);
	}

	async function saveOrder(id: number) {
		const position = columns.findIndex((c) => c.id === id);
		if (position === data.columns.findIndex((c) => c.id === id)) return;
		await run(() => api('PATCH', `${base}/columns/${id}`, { position }));
	}

	async function onDragEnd(e: DragEvent) {
		const id = dragId;
		dragId = armedId = null;
		if (id === null) return;
		// Abgebrochen (Esc oder außerhalb losgelassen): alte Reihenfolge wiederherstellen
		if (e.dataTransfer?.dropEffect === 'none') columns = [...data.columns];
		else await saveOrder(id);
	}

	/** Tastatur: Pfeil hoch/runter auf dem Griff verschiebt die Spalte */
	async function onGripKey(e: KeyboardEvent, id: number) {
		const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
		const from = columns.findIndex((c) => c.id === id);
		const to = from + dir;
		if (!dir || to < 0 || to >= columns.length) return;
		e.preventDefault();
		const [moved] = columns.splice(from, 1);
		columns.splice(to, 0, moved);
		await saveOrder(id);
		(document.querySelector(`[data-grip="${id}"]`) as HTMLElement | null)?.focus();
	}

	async function addColumn(e: SubmitEvent) {
		e.preventDefault();
		if (!newColumn.trim()) return;
		await run(() => api('POST', `${base}/columns`, { name: newColumn }));
		newColumn = '';
	}

	async function addTag(e: SubmitEvent) {
		e.preventDefault();
		if (!newTag.trim()) return;
		await run(() => api('POST', `${base}/tags`, { name: newTag }));
		newTag = '';
	}

	const tagUsage = $derived(
		new Map(data.tags.map((g) => [g.id, data.tickets.filter((t) => t.tags.some((x) => x.id === g.id)).length]))
	);

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
			<Card.Description
				>Name, Farbe und Beschreibung des Projekts. Die Farbe wird im Projekt zur Hauptfarbe.</Card.Description
			>
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
				Tickets in Spalten mit „Erledigt“ gelten als abgeschlossen. Beim Schließen per API landet ein Ticket in der
				ersten Erledigt-Spalte. Tickets in Spalten mit „Backlog“ werden im Gantt-Diagramm standardmäßig ausgeblendet.
			</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			<ul class="flex flex-col gap-2">
				{#each columns as col (col.id)}
					<li
						class={cn('flex items-center gap-2 rounded-md', dragId === col.id && 'bg-muted opacity-60')}
						draggable={armedId === col.id}
						ondragstart={(e) => {
							dragId = col.id;
							e.dataTransfer!.effectAllowed = 'move';
							e.dataTransfer!.setData('text/plain', String(col.id));
						}}
						ondragover={(e) => onDragOver(e, col.id)}
						ondrop={(e) => e.preventDefault()}
						ondragend={onDragEnd}
					>
						<Button
							variant="ghost"
							size="icon"
							class="text-muted-foreground w-6 cursor-grab active:cursor-grabbing"
							data-grip={col.id}
							title="Ziehen zum Sortieren (oder Pfeiltasten)"
							aria-label="Spalte {col.name} verschieben"
							onpointerdown={() => (armedId = col.id)}
							onpointerup={() => dragId === null && (armedId = null)}
							onkeydown={(e) => onGripKey(e, col.id)}
						>
							<GripVertical />
						</Button>
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
						<Label class="shrink-0 px-2 font-normal" title="Im Gantt-Diagramm standardmäßig ausblenden">
							<Checkbox
								checked={col.isBacklog}
								onCheckedChange={(v) => run(() => api('PATCH', `${base}/columns/${col.id}`, { isBacklog: v }))}
							/>
							Backlog
						</Label>
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

	<Card.Root>
		<Card.Header>
			<Card.Title>Tags</Card.Title>
			<Card.Description>
				Tags wie Bug, Feature oder Story zum Einordnen von Tickets. Neue Tags lassen sich auch direkt am Ticket anlegen.
			</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			<ul class="flex flex-col gap-2">
				{#each data.tags as g (g.id)}
					<li class="flex items-center gap-2">
						<TagColorButton
							name={g.name}
							color={g.color}
							onchange={(color) => run(() => api('PATCH', `${base}/tags/${g.id}`, { color }))}
						/>
						<Input
							value={g.name}
							maxlength={40}
							onchange={(e) => run(() => api('PATCH', `${base}/tags/${g.id}`, { name: e.currentTarget.value }))}
						/>
						<span class="w-28 shrink-0"><TagBadge name={g.name} color={g.color} /></span>
						<span class="text-muted-foreground w-20 shrink-0 text-right text-xs">
							{tagUsage.get(g.id)} Ticket{tagUsage.get(g.id) === 1 ? '' : 's'}
						</span>
						<Button
							variant="ghost"
							size="icon"
							class="hover:text-destructive"
							title="Tag löschen"
							aria-label="Tag löschen"
							onclick={() => run(() => api('DELETE', `${base}/tags/${g.id}`), `Tag „${g.name}“ gelöscht`)}
							><Trash2 /></Button
						>
					</li>
				{:else}
					<li class="text-muted-foreground text-sm">Noch keine Tags.</li>
				{/each}
			</ul>
			<form class="flex gap-2" onsubmit={addTag}>
				<Input placeholder="Neuer Tag" maxlength={40} bind:value={newTag} />
				<Button type="submit" variant="outline"><Plus /> Hinzufügen</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-destructive/30">
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
			<AlertDialog.Action class="bg-destructive hover:bg-destructive/90 text-white" onclick={remove}
				>Endgültig löschen</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
