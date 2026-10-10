<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { api, updateProject } from '$lib/api';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import Hint, { chain } from '$lib/components/Hint.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import TagColorButton from '$lib/components/TagColorButton.svelte';
	import Notifications from './Notifications.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import { Synced } from '$lib/synced.svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data } = $props();

	// Lokale Kopien; Live-Updates (z. B. Ticketänderungen anderer) überschreiben keine ungespeicherten Eingaben
	const name = new Synced(untrack(() => data.project.name));
	const description = new Synced(untrack(() => data.project.description));
	const color = new Synced(untrack(() => data.project.color));
	$effect(() => name.update(data.project.name));
	$effect(() => description.update(data.project.description));
	$effect(() => color.update(data.project.color));
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
		await run(
			() => updateProject(data.project.key, { name: name.value, description: description.value, color: color.value }),
			m.project_saved()
		);
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

	async function moveColumn(id: number, direction: number) {
		const from = columns.findIndex((col) => col.id === id);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= columns.length) return;
		const [moved] = columns.splice(from, 1);
		columns.splice(to, 0, moved);
		await saveOrder(id);
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
		toast.success(m.deleted_project({ value1: data.project.name }));
		await goto('/', { invalidateAll: true });
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.project()}</Card.Title>
			<Card.Description>{m.project_name_color_and_description_the_color_becomes_the_project_s_pri()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form class="grid gap-4" onsubmit={save}>
				<div class="grid gap-2">
					<Label for="name">{m.name()}</Label>
					<Input id="name" bind:value={name.value} required />
				</div>
				<div class="grid gap-2">
					<Label>{m.color()}</Label>
					<ColorPicker bind:value={color.value} />
				</div>
				<div class="grid gap-2">
					<Label for="desc">{m.description()}</Label>
					<Textarea id="desc" bind:value={description.value} rows={3} />
				</div>
				<div><Button type="submit">{m.save()}</Button></div>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.board_columns()}</Card.Title>
			<Card.Description>{m.tickets_in_columns_marked_done_are_completed_completing_a_ticket_via_t()}</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			<ul class="flex flex-col gap-2">
				{#each columns as col (col.id)}
					<li
						class={cn(
							'flex flex-wrap items-center gap-2 rounded-md sm:flex-nowrap',
							dragId === col.id && 'bg-muted opacity-60'
						)}
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
						<Hint text={m.drag_to_reorder_or_use_arrow_keys()}>
							{#snippet children(props)}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="text-muted-foreground w-6 cursor-grab active:cursor-grabbing"
									data-grip={col.id}
									aria-label={m.move_column({ value1: col.name })}
									onpointerdown={chain<PointerEvent>(props.onpointerdown, () => (armedId = col.id))}
									onpointerup={chain<PointerEvent>(props.onpointerup, () => dragId === null && (armedId = null))}
									onkeydown={chain<KeyboardEvent>(props.onkeydown, (e) => onGripKey(e, col.id))}
								>
									<GripVertical />
								</Button>
							{/snippet}
						</Hint>
						<div class="flex gap-1 sm:hidden">
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.mobile_move_up({ name: col.name })}
								disabled={columns[0].id === col.id}
								onclick={() => moveColumn(col.id, -1)}><ArrowUp /></Button
							><Button
								variant="ghost"
								size="icon"
								aria-label={m.mobile_move_down({ name: col.name })}
								disabled={columns[columns.length - 1].id === col.id}
								onclick={() => moveColumn(col.id, 1)}><ArrowDown /></Button
							>
						</div>
						<Input
							class="max-sm:order-first max-sm:basis-full"
							value={col.name}
							onchange={(e) => run(() => api('PATCH', `${base}/columns/${col.id}`, { name: e.currentTarget.value }))}
						/>
						<Label class="shrink-0 px-2 font-normal">
							<Checkbox
								checked={col.isDone}
								onCheckedChange={(v) => run(() => api('PATCH', `${base}/columns/${col.id}`, { isDone: v }))}
							/>
							{m.done()}
						</Label>
						<Hint text={m.hide_in_gantt_chart_by_default()}>
							{#snippet children(props)}
								<Label {...props} class="shrink-0 px-2 font-normal">
									<Checkbox
										checked={col.isBacklog}
										onCheckedChange={(v) => run(() => api('PATCH', `${base}/columns/${col.id}`, { isBacklog: v }))}
									/>
									{m.backlog()}
								</Label>
							{/snippet}
						</Hint>
						<Hint text={m.delete_column()}>
							{#snippet children(props)}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="hover:text-destructive"
									aria-label={m.delete_column()}
									onclick={() => run(() => api('DELETE', `${base}/columns/${col.id}`))}><Trash2 /></Button
								>
							{/snippet}
						</Hint>
					</li>
				{/each}
			</ul>
			<form class="flex gap-2" onsubmit={addColumn}>
				<Input placeholder={m.new_column()} bind:value={newColumn} />
				<Button type="submit" variant="outline"><Plus /> {m.add()}</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.tags()}</Card.Title>
			<Card.Description>{m.organize_tickets_with_tags_such_as_bug_feature_or_story_you_can_also_c()}</Card.Description>
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
							{m.ticket_2({ value1: tagUsage.get(g.id) ?? 0, value2: tagUsage.get(g.id) === 1 ? '' : 's' })}
						</span>
						<Hint text={m.delete_tag()}>
							{#snippet children(props)}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="hover:text-destructive"
									aria-label={m.delete_tag()}
									onclick={() => run(() => api('DELETE', `${base}/tags/${g.id}`), m.deleted_tag({ name: g.name }))}
									><Trash2 /></Button
								>
							{/snippet}
						</Hint>
					</li>
				{:else}
					<li class="text-muted-foreground text-sm">{m.no_tags_yet()}</li>
				{/each}
			</ul>
			<form class="flex gap-2" onsubmit={addTag}>
				<Input placeholder={m.new_tag()} maxlength={40} bind:value={newTag} />
				<Button type="submit" variant="outline"><Plus /> {m.add()}</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Notifications project={data.project.key} notifications={data.notifications} />

	<Card.Root class="border-destructive/30">
		<Card.Header class="flex items-center gap-4">
			<div class="grow">
				<Card.Title>{m.delete_project()}</Card.Title>
				<Card.Description>{m.permanently_deletes_the_project_and_all_its_tickets()}</Card.Description>
			</div>
			<Button variant="destructive" onclick={() => (confirmDelete = true)}><Trash2 /> {m.delete()}</Button>
		</Card.Header>
	</Card.Root>
</div>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.delete_project_2({ value1: data.project.name })}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.the_project_and_all_tickets_will_be_permanently_deleted_this_cannot_be({ value1: data.tickets.length })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action class="bg-destructive hover:bg-destructive/90 text-white" onclick={remove}
				>{m.delete_permanently()}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
