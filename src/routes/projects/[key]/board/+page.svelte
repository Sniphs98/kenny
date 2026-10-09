<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api, PRIORITY_LABELS } from '$lib/api';
	import AssigneePicker from '$lib/components/AssigneePicker.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import Gantt from '$lib/components/Gantt.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Input } from '$lib/components/ui/input';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { openTicket } from '$lib/ticket-modal';
	import { cn } from '$lib/utils';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import Ban from '@lucide/svelte/icons/ban';
	import Calendar from '@lucide/svelte/icons/calendar';
	import ChartGantt from '@lucide/svelte/icons/chart-gantt';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Circle from '@lucide/svelte/icons/circle';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CornerDownRight from '@lucide/svelte/icons/corner-down-right';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import TagIcon from '@lucide/svelte/icons/tag';
	import UserRound from '@lucide/svelte/icons/user-round';

	let { data } = $props();

	type Item = (typeof data.tickets)[number];

	const me = $derived(page.data.user?.id);

	let search = $state('');
	let showSubtasks = $state(false);
	/** Filter nach Zuständigem: 'all', 'me', 'none' oder eine Benutzer-ID */
	let assigneeFilter = $state('all');
	/** Filter nach Tag: 'all' oder eine Tag-ID */
	let tagFilter = $state('all');
	const tagFilterLabel = $derived(data.tags.find((g) => String(g.id) === tagFilter)?.name ?? 'Alle Tags');
	let dialog: TicketDialog;

	const filterLabel = $derived(
		assigneeFilter === 'all'
			? 'Alle Zuständigen'
			: assigneeFilter === 'me'
				? 'Mir zugewiesen'
				: assigneeFilter === 'none'
					? 'Nicht zugewiesen'
					: (data.users.find((u) => u.id === assigneeFilter)?.name ?? 'Alle Zuständigen')
	);

	// Zeitplan über dem Board, auf-/zuklappbar; Zustand wird im Browser gemerkt
	let showTimeline = $state(true);
	const scheduled = $derived(data.tickets.filter((t) => t.startDate || t.dueDate).length);
	onMount(() => {
		try {
			showTimeline = localStorage.getItem('board-timeline') !== 'closed';
		} catch {}
	});
	$effect(() => {
		try {
			localStorage.setItem('board-timeline', showTimeline ? 'open' : 'closed');
		} catch {}
	});

	// Lokale Kopie, damit Drag & Drop sofort sichtbar ist
	let tickets = $state<Item[]>([]);
	$effect(() => {
		tickets = data.tickets.map((t) => ({ ...t }));
	});

	const byId = $derived(new Map(data.tickets.map((t) => [t.id, t])));

	/** Unteraufgaben je Elternticket, für die aufklappbare Liste auf der Karte */
	const childrenOf = $derived.by(() => {
		const m = new Map<number, Item[]>();
		for (const t of data.tickets) {
			if (t.parentId === null) continue;
			if (!m.has(t.parentId)) m.set(t.parentId, []);
			m.get(t.parentId)!.push(t);
		}
		for (const list of m.values()) list.sort((a, b) => a.number - b.number);
		return m;
	});
	/** Karten mit aufgeklappten Unteraufgaben; standardmäßig sind alle zugeklappt */
	const expanded = new SvelteSet<number>();

	function toggleSubtasks(e: MouseEvent, id: number) {
		e.stopPropagation();
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	function matchesAssignee(t: Item) {
		if (assigneeFilter === 'all') return true;
		if (assigneeFilter === 'me') return t.assigneeId === me;
		if (assigneeFilter === 'none') return !t.assigneeId;
		return t.assigneeId === assigneeFilter;
	}

	const visible = $derived(
		tickets.filter(
			(t) =>
				(showSubtasks || t.parentId === null) &&
				matchesAssignee(t) &&
				(tagFilter === 'all' || t.tags.some((g) => String(g.id) === tagFilter)) &&
				(!search ||
					t.title.toLowerCase().includes(search.toLowerCase()) ||
					t.key.toLowerCase().includes(search.toLowerCase()))
		)
	);

	function columnTickets(columnId: number) {
		return visible.filter((t) => t.columnId === columnId).sort((a, b) => a.position - b.position);
	}

	// --- Drag & Drop ---
	let dragId = $state<number | null>(null);
	let dropTarget = $state<{ columnId: number; index: number } | null>(null);

	function onDragStart(e: DragEvent, t: Item) {
		dragId = t.id;
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', String(t.id));
	}

	function onDragOver(e: DragEvent, columnId: number, list: HTMLElement) {
		if (dragId === null) return;
		e.preventDefault();
		const cards = [...list.querySelectorAll<HTMLElement>('[data-card]')].filter(
			(c) => Number(c.dataset.card) !== dragId
		);
		let index = cards.length;
		for (let i = 0; i < cards.length; i++) {
			const r = cards[i].getBoundingClientRect();
			if (e.clientY < r.top + r.height / 2) {
				index = i;
				break;
			}
		}
		dropTarget = { columnId, index };
	}

	async function onDrop(e: DragEvent) {
		e.preventDefault();
		if (dragId === null || !dropTarget) return;
		const id = dragId;
		const { columnId, index } = dropTarget;
		dragId = null;
		dropTarget = null;

		// Position bezieht sich auf alle Tickets der Spalte, nicht nur die sichtbaren
		const col = tickets
			.filter((t) => t.columnId === columnId && t.id !== id)
			.sort((a, b) => a.position - b.position);
		const visibleCol = columnTickets(columnId).filter((t) => t.id !== id);
		const anchor = visibleCol[index];
		const position = anchor ? col.indexOf(anchor) : col.length;

		const moved = tickets.find((t) => t.id === id)!;
		col.splice(position, 0, moved);
		col.forEach((t, i) => (t.position = i));
		moved.columnId = columnId;

		try {
			await api('PATCH', `/tickets/${id}`, { columnId, position });
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	function onDragEnd() {
		dragId = null;
		dropTarget = null;
	}

	async function assign(t: Item, assigneeId: string | null) {
		t.assigneeId = assigneeId;
		t.assigneeName = data.users.find((u) => u.id === assigneeId)?.name ?? null;
		try {
			await api('PATCH', `/tickets/${t.id}`, { assigneeId });
			toast.success(assigneeId ? `${t.key} an ${t.assigneeName} zugewiesen` : `Zuweisung von ${t.key} entfernt`);
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	// --- Schnell-Anlegen ---
	let quickColumn = $state<number | null>(null);
	let quickTitle = $state('');

	async function quickAdd(e: SubmitEvent, columnId: number) {
		e.preventDefault();
		if (!quickTitle.trim()) return;
		try {
			await api('POST', `/projects/${data.project.key}/tickets`, { title: quickTitle, columnId });
			quickTitle = '';
			await invalidateAll();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	function overdue(t: Item) {
		return !t.closed && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
	}
</script>

<div class="flex flex-wrap items-center gap-2 px-5 py-3.5">
	<InputGroup.Root class="w-60">
		<InputGroup.Addon><Search /></InputGroup.Addon>
		<InputGroup.Input placeholder="Tickets suchen…" bind:value={search} />
	</InputGroup.Root>
	<Select.Root type="single" bind:value={assigneeFilter}>
		<Select.Trigger class="w-48">
			<span class="flex items-center gap-2"><UserRound class="text-muted-foreground" />{filterLabel}</span>
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="all">Alle Zuständigen</Select.Item>
			<Select.Item value="me">Mir zugewiesen</Select.Item>
			<Select.Item value="none">Nicht zugewiesen</Select.Item>
			<Select.Separator />
			{#each data.users as u (u.id)}
				<Select.Item value={u.id}>{u.name}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Select.Root type="single" bind:value={tagFilter}>
		<Select.Trigger class="w-40">
			<span class="flex items-center gap-2 truncate"><TagIcon class="text-muted-foreground" />{tagFilterLabel}</span>
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="all">Alle Tags</Select.Item>
			{#if data.tags.length}<Select.Separator />{/if}
			{#each data.tags as g (g.id)}
				<Select.Item value={String(g.id)}><TagBadge name={g.name} color={g.color} /></Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Label class="ml-1 font-normal"><Checkbox bind:checked={showSubtasks} /> Unteraufgaben anzeigen</Label>
	<span class="grow"></span>
	<Button onclick={() => dialog.open()}><Plus /> Ticket</Button>
</div>

<Collapsible.Root bind:open={showTimeline} class="mb-4 border-b">
	<Collapsible.Trigger class="group hover:bg-muted mx-5 mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold">
		<ChevronRight class="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-90" />
		<ChartGantt class="size-4" />
		Zeitplan
		<span class="text-muted-foreground text-xs font-medium">{scheduled} mit Termin</span>
	</Collapsible.Trigger>
	<Collapsible.Content>
		<Gantt tickets={data.tickets} dependencies={data.dependencies} columns={data.columns} color={data.project.color} maxHeight="360px" />
	</Collapsible.Content>
</Collapsible.Root>

<div class="flex min-h-[calc(100vh-200px)] items-start gap-3.5 overflow-x-auto px-5 pb-5">
	{#each data.columns as col (col.id)}
		{@const list = columnTickets(col.id)}
		<section class="bg-muted/60 flex max-h-[calc(100vh-210px)] w-72 shrink-0 flex-col gap-1.5 rounded-xl p-1.5">
			<header class="flex items-center gap-1.5 py-1 pr-1 pl-2 text-sm">
				{#if col.isDone}<CircleCheck class="text-success size-4" />{/if}
				<strong class="font-semibold">{col.name}</strong>
				<span class="text-muted-foreground text-xs font-medium">{list.length}</span>
				<span class="grow"></span>
				<Button
					variant="ghost"
					size="icon-xs"
					title="Ticket hinzufügen"
					aria-label="Ticket hinzufügen"
					onclick={() => ((quickColumn = col.id), (quickTitle = ''))}
				>
					<Plus />
				</Button>
			</header>
			<div
				class="flex min-h-10 flex-col gap-1.5 overflow-y-auto"
				role="region"
				aria-label={col.name}
				ondragover={(e) => onDragOver(e, col.id, e.currentTarget as HTMLElement)}
				ondrop={onDrop}
			>
				{#each list as t, i (t.id)}
					{#if dropTarget?.columnId === col.id && dropTarget.index === i && dragId !== t.id}
						<div class="bg-primary h-0.5 rounded-full"></div>
					{/if}
					<!-- Klick auf die Karte ist nur eine Abkürzung; per Tastatur führt der Titel-Link zum Ticket -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
					<div
						class={cn(
							'bg-card border-foreground/10 hover:border-foreground/25 flex cursor-grab flex-col gap-1.5 rounded-md border px-3 py-2.5 text-sm transition-colors',
							dragId === t.id && 'opacity-40'
						)}
						data-card={t.id}
						draggable="true"
						role="listitem"
						ondragstart={(e) => onDragStart(e, t)}
						ondragend={onDragEnd}
						onclick={(e) => openTicket(t.key, e)}
					>
						<div class="flex items-center gap-2">
							<span class="prio prio-{t.priority}" title={PRIORITY_LABELS[t.priority]}></span>
							<span class="text-muted-foreground grow font-mono text-xs">{t.key}</span>
							<AssigneePicker compact users={data.users} {me} value={t.assigneeId} onchange={(id) => assign(t, id)} />
						</div>
						<a
							href="/tickets/{t.key}"
							class={cn('font-medium break-words hover:underline', t.closed && 'text-muted-foreground line-through')}
							onclick={(e) => (e.stopPropagation(), openTicket(t.key, e))}
							draggable="false">{t.title}</a
						>
						{#if t.tags.length}
							<div class="flex flex-wrap gap-1">
								{#each t.tags as g (g.id)}<TagBadge name={g.name} color={g.color} />{/each}
							</div>
						{/if}
						{#if t.parentId && byId.get(t.parentId)}
							<div class="text-muted-foreground flex items-center gap-1 text-xs">
								<CornerDownRight class="size-3" />
								{byId.get(t.parentId)?.key}
							</div>
						{/if}
						{#if t.subtaskCount > 0 || (t.openBlockers > 0 && !t.closed) || t.dueDate}
							<div class="flex flex-wrap gap-1">
								{#if t.subtaskCount > 0}
									<button
										type="button"
										class="group/sub rounded-4xl"
										data-state={expanded.has(t.id) ? 'open' : 'closed'}
										aria-expanded={expanded.has(t.id)}
										title={expanded.has(t.id) ? 'Unteraufgaben zuklappen' : 'Unteraufgaben aufklappen'}
										onclick={(e) => toggleSubtasks(e, t.id)}
									>
										<Badge
											variant="secondary"
											class={cn('hover:bg-secondary/70 cursor-pointer', t.subtaskDone === t.subtaskCount && 'text-success')}
										>
											<ChevronRight class="transition-transform group-data-[state=open]/sub:rotate-90" />
											<ListChecks /> {t.subtaskDone}/{t.subtaskCount}
										</Badge>
									</button>
								{/if}
								{#if t.openBlockers > 0 && !t.closed}
									<Badge variant="secondary" class="text-warning" title="Wartet auf andere Tickets">
										<Ban /> blockiert ({t.openBlockers})
									</Badge>
								{/if}
								{#if t.dueDate}
									<Badge variant="secondary" class={cn(overdue(t) && 'text-destructive')}>
										<Calendar /> {new Date(t.dueDate).toLocaleDateString('de-DE')}
									</Badge>
								{/if}
							</div>
						{/if}
						{#if expanded.has(t.id) && childrenOf.get(t.id)?.length}
							<ul class="-mx-1 flex flex-col border-t pt-1.5">
								{#each childrenOf.get(t.id)! as s (s.id)}
									<li>
										<a
											href="/tickets/{s.key}"
											class="hover:bg-muted flex items-center gap-1.5 rounded px-1 py-0.5 text-xs"
											onclick={(e) => (e.stopPropagation(), openTicket(s.key, e))}
											draggable="false"
										>
											{#if s.closed}
												<CircleCheck class="text-success size-3.5 shrink-0" />
											{:else}
												<Circle class="text-muted-foreground size-3.5 shrink-0" />
											{/if}
											<span class="text-muted-foreground shrink-0 font-mono">{s.key}</span>
											<span class={cn('truncate', s.closed && 'text-muted-foreground line-through')}>{s.title}</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
				{#if dropTarget?.columnId === col.id && dropTarget.index >= list.filter((t) => t.id !== dragId).length}
					<div class="bg-primary h-0.5 rounded-full"></div>
				{/if}
			</div>
			{#if quickColumn === col.id}
				<form onsubmit={(e) => quickAdd(e, col.id)}>
					<!-- svelte-ignore a11y_autofocus -->
					<Input
						autofocus
						class="bg-card"
						placeholder="Titel, Enter zum Anlegen"
						bind:value={quickTitle}
						onblur={() => !quickTitle && (quickColumn = null)}
						onkeydown={(e) => e.key === 'Escape' && (quickColumn = null)}
					/>
				</form>
			{:else}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground justify-start"
					onclick={() => ((quickColumn = col.id), (quickTitle = ''))}
				>
					<Plus /> Ticket hinzufügen
				</Button>
			{/if}
		</section>
	{/each}
</div>

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	tags={data.tags}
	parents={data.tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` }))}
/>
