<script lang="ts">
	import { intlLocale } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import type { UpdateTicketInput } from '$lib/contracts';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { createTicket, updateTicket, PRIORITY_LABELS } from '$lib/api';
	import BoardCard from '$lib/components/BoardCard.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import Gantt from '$lib/components/Gantt.svelte';
	import Hint from '$lib/components/Hint.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { cn } from '$lib/utils';
	import { onMount, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { playIfCompleted } from '$lib/sound';
	import { toast } from 'svelte-sonner';
	import ArrowDownUp from '@lucide/svelte/icons/arrow-down-up';
	import ChartGantt from '@lucide/svelte/icons/chart-gantt';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Plus from '@lucide/svelte/icons/plus';
	import Rows3 from '@lucide/svelte/icons/rows-3';
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
	const tagFilterLabel = $derived(data.tags.find((g) => String(g.id) === tagFilter)?.name ?? m.all_tags());
	let dialog: TicketDialog;

	const filterLabel = $derived(
		assigneeFilter === 'all'
			? m.all_assignees()
			: assigneeFilter === 'me'
				? m.assigned_to_me()
				: assigneeFilter === 'none'
					? m.unassigned()
					: (data.users.find((u) => u.id === assigneeFilter)?.name ?? m.all_assignees())
	);

	// Zeitplan über dem Board, auf-/zuklappbar; Zustand wird im Browser gemerkt
	let showTimeline = $state(true);
	/** Höhe des Zeitplans in px, per Griff einstellbar */
	let timelineHeight = $state(360);
	const scheduled = $derived(data.tickets.filter((t) => t.startDate || t.dueDate).length);
	onMount(() => {
		try {
			showTimeline = localStorage.getItem('board-timeline') !== 'closed';
			const h = Number(localStorage.getItem('board-timeline-height'));
			if (h >= 120) timelineHeight = h;
		} catch {
			/* Storage may be unavailable in private browsing. */
		}
	});
	$effect(() => {
		try {
			localStorage.setItem('board-timeline', showTimeline ? 'open' : 'closed');
			localStorage.setItem('board-timeline-height', String(timelineHeight));
		} catch {
			/* Storage may be unavailable in private browsing. */
		}
	});

	// --- Sortierung und Gruppierung ---
	const SORTS = {
		manual: m.manual(),
		created_desc: m.newest_first(),
		created_asc: m.oldest_first(),
		updated_desc: m.recently_updated(),
		due_asc: m.due_date(),
		priority_desc: m.priority_high_low(),
		priority_asc: m.priority_low_high(),
		title_asc: m.title_a_z()
	} as const;
	type Sort = keyof typeof SORTS;

	const GROUPS = { none: m.none(), tag: m.tag(), assignee: m.assignee(), priority: m.priority_2() } as const;
	type Group = keyof typeof GROUPS;

	let sortBy = $state<Sort>('manual');
	/** Abweichende Sortierung einzelner Spalten */
	let columnSort = $state<Record<number, Sort>>({});
	let groupBy = $state<Group>('none');
	const collapsedLanes = new SvelteSet<string>();

	// Ansicht pro Projekt im Browser merken
	const viewKey = $derived(`board-view:${data.project.key}`);
	let viewLoaded = $state(false);
	$effect(() => {
		const key = viewKey;
		// Nur beim Projektwechsel laden, nicht bei Änderungen an der Ansicht selbst
		untrack(() => {
			viewLoaded = false;
			try {
				const v = JSON.parse(localStorage.getItem(key) ?? '{}');
				sortBy = v.sortBy in SORTS ? v.sortBy : 'manual';
				groupBy = v.groupBy in GROUPS ? v.groupBy : 'none';
				columnSort = v.columnSort && typeof v.columnSort === 'object' ? v.columnSort : {};
				collapsedLanes.clear();
				for (const l of Array.isArray(v.collapsed) ? v.collapsed : []) collapsedLanes.add(String(l));
			} catch {
				/* Storage may be unavailable in private browsing. */
			}
			viewLoaded = true;
		});
	});
	$effect(() => {
		const v = { sortBy, groupBy, columnSort, collapsed: [...collapsedLanes] };
		if (!viewLoaded) return;
		try {
			localStorage.setItem(viewKey, JSON.stringify(v));
		} catch {
			/* Storage may be unavailable in private browsing. */
		}
	});

	const sortOf = (columnId: number): Sort => columnSort[columnId] ?? sortBy;

	function setColumnSort(columnId: number, value: Sort | 'board') {
		const next = { ...columnSort };
		if (value === 'board') delete next[columnId];
		else next[columnId] = value;
		columnSort = next;
	}

	const PRIO_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
	const time = (d: Date | string) => new Date(d).getTime();
	const manual = (a: Item, b: Item) => a.position - b.position || a.number - b.number;

	const comparators: Record<Sort, (a: Item, b: Item) => number> = {
		manual,
		created_desc: (a, b) => time(b.createdAt) - time(a.createdAt),
		created_asc: (a, b) => time(a.createdAt) - time(b.createdAt),
		updated_desc: (a, b) => time(b.updatedAt) - time(a.updatedAt),
		// Ohne Fälligkeit ans Ende
		due_asc: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || manual(a, b),
		priority_desc: (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || manual(a, b),
		priority_asc: (a, b) => PRIO_RANK[b.priority] - PRIO_RANK[a.priority] || manual(a, b),
		title_asc: (a, b) => a.title.localeCompare(b.title, intlLocale()) || manual(a, b)
	};

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

	function toggleSubtasks(id: number) {
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

	/**
	 * Swimlanes: jede Bahn hat einen Schlüssel, eine Beschriftung und die Felder,
	 * die ein Ticket beim Hineinziehen bzw. Anlegen in dieser Bahn bekommt.
	 */
	type Lane = {
		key: string;
		label: string;
		kind: Group;
		color?: string;
		userName?: string | null;
		priority?: string;
		match: (t: Item) => boolean;
		preset: UpdateTicketInput;
	};

	const lanes = $derived.by((): Lane[] => {
		if (groupBy === 'tag') {
			return [
				...data.tags.map((g) => ({
					key: `tag:${g.id}`,
					label: g.name,
					kind: 'tag' as const,
					color: g.color,
					match: (t: Item) => t.tags.some((x) => x.id === g.id),
					preset: { tags: [g.id] }
				})),
				{ key: 'tag:none', label: m.no_tag(), kind: 'tag', match: (t) => !t.tags.length, preset: { tags: [] } }
			];
		}
		if (groupBy === 'assignee') {
			const users = [...data.users].sort(
				(a, b) => Number(b.id === me) - Number(a.id === me) || a.name.localeCompare(b.name)
			);
			return [
				...users.map((u) => ({
					key: `user:${u.id}`,
					label: u.id === me ? m.me_2({ value1: u.name }) : u.name,
					kind: 'assignee' as const,
					userName: u.name,
					match: (t: Item) => t.assigneeId === u.id,
					preset: { assigneeId: u.id }
				})),
				{
					key: 'user:none',
					label: m.unassigned(),
					kind: 'assignee',
					userName: null,
					match: (t) => !t.assigneeId,
					preset: { assigneeId: null }
				}
			];
		}
		if (groupBy === 'priority') {
			return (['urgent', 'high', 'medium', 'low'] as const).map((p) => ({
				key: `prio:${p}`,
				label: PRIORITY_LABELS[p],
				kind: 'priority' as const,
				priority: p,
				match: (t: Item) => t.priority === p,
				preset: { priority: p }
			}));
		}
		return [{ key: 'all', label: '', kind: 'none', match: () => true, preset: {} }];
	});

	/** Tickets je Bahn und Spalte, bereits sortiert */
	const cells = $derived.by(() => {
		const m = new Map<string, Item[]>();
		for (const lane of lanes) {
			const inLane = visible.filter(lane.match);
			for (const col of data.columns) {
				m.set(`${lane.key}|${col.id}`, inLane.filter((t) => t.columnId === col.id).sort(comparators[sortOf(col.id)]));
			}
		}
		return m;
	});
	const cell = (laneKey: string, columnId: number) => cells.get(`${laneKey}|${columnId}`) ?? [];
	const laneCount = (lane: Lane) => visible.filter(lane.match).length;
	const columnCount = (columnId: number) => visible.filter((t) => t.columnId === columnId).length;
	// Leere Bahnen ausblenden, außer es gibt gar keine Tickets
	const shownLanes = $derived(groupBy === 'none' ? lanes : lanes.filter((l) => laneCount(l) > 0));

	// --- Drag & Drop ---
	let drag = $state<{ id: number; lane: string } | null>(null);
	let dropTarget = $state<{ lane: string; columnId: number; index: number } | null>(null);

	function onDragStart(e: DragEvent, t: Item, lane: string) {
		if (!data.canEdit) return;
		drag = { id: t.id, lane };
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', String(t.id));
	}

	function onDragOver(e: DragEvent, lane: string, columnId: number, list: HTMLElement) {
		if (!drag) return;
		e.preventDefault();
		const cards = [...list.querySelectorAll<HTMLElement>('[data-card]')].filter(
			(c) => Number(c.dataset.card) !== drag!.id
		);
		let index = cards.length;
		for (let i = 0; i < cards.length; i++) {
			const r = cards[i].getBoundingClientRect();
			if (e.clientY < r.top + r.height / 2) {
				index = i;
				break;
			}
		}
		dropTarget = { lane, columnId, index };
	}

	/** Felder, die sich beim Wechsel der Bahn ändern */
	function laneChange(t: Item, from: Lane, to: Lane): UpdateTicketInput {
		if (from.key === to.key) return {};
		if (to.kind === 'tag') {
			// Tag der alten Bahn durch den der neuen ersetzen, andere Tags bleiben
			if (!(to.preset.tags as number[]).length) return { tags: [] };
			const fromTag = (from.preset.tags as number[])[0];
			const ids = t.tags.map((g) => g.id).filter((id) => id !== fromTag);
			return { tags: [...new Set([...ids, ...(to.preset.tags as number[])])] };
		}
		return to.preset;
	}

	async function onDrop(e: DragEvent) {
		e.preventDefault();
		if (!drag || !dropTarget) return;
		const { id, lane: fromLane } = drag;
		const { lane: toLane, columnId, index } = dropTarget;
		drag = null;
		dropTarget = null;

		const moved = tickets.find((t) => t.id === id)!;
		const from = lanes.find((l) => l.key === fromLane)!;
		const to = lanes.find((l) => l.key === toLane)!;
		const body: UpdateTicketInput = laneChange(moved, from, to);

		if (sortOf(columnId) === 'manual') {
			// Position bezieht sich auf alle Tickets der Spalte, nicht nur die sichtbaren
			const col = tickets.filter((t) => t.columnId === columnId && t.id !== id).sort(manual);
			const anchor = cell(toLane, columnId).filter((t) => t.id !== id)[index];
			const position = anchor ? col.indexOf(anchor) : col.length;
			col.splice(position, 0, moved);
			col.forEach((t, i) => (t.position = i));
			body.columnId = columnId;
			body.position = position;
		} else if (columnId !== moved.columnId) {
			// Sortierte Spalte: Reihenfolge ergibt sich aus der Sortierung, nur der Status ändert sich
			body.columnId = columnId;
		}
		if (!Object.keys(body).length) return;
		const wasClosed = moved.closed;
		moved.columnId = columnId;

		try {
			playIfCompleted(wasClosed, await updateTicket(id, body));
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	function onDragEnd() {
		drag = null;
		dropTarget = null;
	}

	async function assign(t: Item, assigneeId: string | null) {
		t.assigneeId = assigneeId;
		t.assigneeName = data.users.find((u) => u.id === assigneeId)?.name ?? null;
		try {
			await updateTicket(t.id, { assigneeId });
			toast.success(
				assigneeId ? m.assigned_to({ value1: t.key, value2: t.assigneeName ?? '' }) : m.unassigned_2({ value1: t.key })
			);
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	// --- Schnell-Anlegen (übernimmt die Werte der Bahn, z.B. den Tag) ---
	let quickCell = $state<string | null>(null);
	let quickTitle = $state('');

	async function quickAdd(e: SubmitEvent, lane: Lane, columnId: number) {
		e.preventDefault();
		if (!quickTitle.trim()) return;
		try {
			await createTicket(data.project.key, { ...lane.preset, title: quickTitle, columnId });
			quickTitle = '';
			await invalidateAll();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	function toggleLane(key: string) {
		if (collapsedLanes.has(key)) collapsedLanes.delete(key);
		else collapsedLanes.add(key);
	}
</script>

{#snippet columnHeader(col: (typeof data.columns)[number], lane: Lane | null)}
	{@const sort = sortOf(col.id)}
	<header class="flex items-center gap-1.5 py-1 pr-1 pl-2 text-sm">
		{#if col.isDone}<CircleCheck class="text-success size-4" />{/if}
		<strong class="font-semibold">{col.name}</strong>
		<span class="text-muted-foreground text-xs font-medium">{columnCount(col.id)}</span>
		<span class="grow"></span>
		<DropdownMenu.Root>
			<Hint text={m.sort_column({ value1: SORTS[sort] })}>
				{#snippet children(props)}
					<DropdownMenu.Trigger
						{...props}
						class={cn(
							'hover:bg-muted text-muted-foreground hover:text-foreground flex h-6 items-center gap-1 rounded-md px-1.5 text-xs',
							columnSort[col.id] && 'text-primary bg-primary/10'
						)}
						aria-label={m.sort_column_2({ value1: col.name })}
					>
						<ArrowDownUp class="size-3.5" />
						{#if columnSort[col.id]}<span class="max-w-20 truncate">{SORTS[sort]}</span>{/if}
					</DropdownMenu.Trigger>
				{/snippet}
			</Hint>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Label>{m.sort_column_3({ value1: col.name })}</DropdownMenu.Label>
				<DropdownMenu.RadioGroup
					value={columnSort[col.id] ?? 'board'}
					onValueChange={(v) => setColumnSort(col.id, v as Sort | 'board')}
				>
					<DropdownMenu.RadioItem value="board">{m.same_as_board({ value1: SORTS[sortBy] })}</DropdownMenu.RadioItem>
					<DropdownMenu.Separator />
					{#each Object.entries(SORTS) as [v, l] (v)}
						<DropdownMenu.RadioItem value={v}>{l}</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		{#if lane && data.canEdit}
			<Hint text={m.add_ticket()}>
				{#snippet children(props)}
					<Button
						{...props}
						variant="ghost"
						size="icon-xs"
						aria-label={m.add_ticket()}
						onclick={() => ((quickCell = `${lane.key}|${col.id}`), (quickTitle = ''))}
					>
						<Plus />
					</Button>
				{/snippet}
			</Hint>
		{/if}
	</header>
{/snippet}

{#snippet columnCell(lane: Lane, col: (typeof data.columns)[number], grouped: boolean)}
	{@const list = cell(lane.key, col.id)}
	{@const manualSort = sortOf(col.id) === 'manual'}
	{@const target = dropTarget?.lane === lane.key && dropTarget.columnId === col.id}
	{@const cellKey = `${lane.key}|${col.id}`}
	<section
		class={cn(
			'bg-muted/60 flex w-72 shrink-0 flex-col gap-1.5 rounded-xl p-1.5 transition-shadow',
			!grouped && 'max-h-[calc(100vh-210px)]',
			target && !manualSort && 'ring-primary/50 ring-2'
		)}
	>
		{#if !grouped}{@render columnHeader(col, lane)}{/if}
		<div
			class={cn('flex min-h-10 flex-col gap-1.5', !grouped && 'overflow-y-auto')}
			role="region"
			aria-label={grouped ? `${lane.label}: ${col.name}` : col.name}
			ondragover={(e) => onDragOver(e, lane.key, col.id, e.currentTarget as HTMLElement)}
			ondrop={onDrop}
		>
			{#each list as t, i (t.id)}
				{#if target && manualSort && dropTarget!.index === i && drag?.id !== t.id}
					<div class="bg-primary h-0.5 rounded-full"></div>
				{/if}
				<BoardCard
					readOnly={!data.canEdit}
					{t}
					parent={t.parentId ? byId.get(t.parentId) : undefined}
					subtasks={childrenOf.get(t.id) ?? []}
					users={data.users}
					{me}
					expanded={expanded.has(t.id)}
					dragging={drag?.id === t.id}
					onToggleSubtasks={() => toggleSubtasks(t.id)}
					onAssign={(id) => assign(t, id)}
					ondragstart={(e) => onDragStart(e, t, lane.key)}
					ondragend={onDragEnd}
				/>
			{/each}
			{#if target && manualSort && dropTarget!.index >= list.filter((t) => t.id !== drag?.id).length}
				<div class="bg-primary h-0.5 rounded-full"></div>
			{/if}
		</div>
		{#if quickCell === cellKey}
			<form onsubmit={(e) => quickAdd(e, lane, col.id)}>
				<!-- svelte-ignore a11y_autofocus -->
				<Input
					autofocus
					class="bg-card"
					placeholder={m.title_enter_to_create()}
					bind:value={quickTitle}
					onblur={() => !quickTitle && (quickCell = null)}
					onkeydown={(e) => e.key === 'Escape' && (quickCell = null)}
				/>
			</form>
		{:else if data.canEdit}
			<Button
				variant="ghost"
				size="sm"
				class={cn(
					'text-muted-foreground justify-start',
					grouped && 'opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100'
				)}
				onclick={() => ((quickCell = cellKey), (quickTitle = ''))}
			>
				<Plus />
				{m.add_ticket()}
			</Button>
		{/if}
	</section>
{/snippet}

{#if !data.canEdit}<p class="text-muted-foreground px-5 pt-3 text-sm">{m.um_read_only()}</p>{/if}
<div class="flex flex-wrap items-center gap-2 px-5 py-3.5">
	<InputGroup.Root class="w-60">
		<InputGroup.Addon><Search /></InputGroup.Addon>
		<InputGroup.Input placeholder={m.search_tickets()} bind:value={search} />
	</InputGroup.Root>
	<Select.Root type="single" bind:value={assigneeFilter}>
		<Select.Trigger class="w-48">
			<span class="flex items-center gap-2"><UserRound class="text-muted-foreground" />{filterLabel}</span>
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="all">{m.all_assignees()}</Select.Item>
			<Select.Item value="me">{m.assigned_to_me()}</Select.Item>
			<Select.Item value="none">{m.unassigned()}</Select.Item>
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
			<Select.Item value="all">{m.all_tags()}</Select.Item>
			{#if data.tags.length}<Select.Separator />{/if}
			{#each data.tags as g (g.id)}
				<Select.Item value={String(g.id)}><TagBadge name={g.name} color={g.color} /></Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Label class="ml-1 font-normal"><Checkbox bind:checked={showSubtasks} /> {m.show_subtasks()}</Label>
	<span class="grow"></span>
	<Select.Root type="single" value={groupBy} onValueChange={(v) => (groupBy = v as Group)}>
		<Hint text={m.group_swimlanes()}>
			{#snippet children(props)}
				<Select.Trigger {...props} class="w-44">
					<span class="flex items-center gap-2"
						><Rows3 class="text-muted-foreground" /><span class="text-muted-foreground">{m.group()}</span>{GROUPS[
							groupBy
						]}</span
					>
				</Select.Trigger>
			{/snippet}
		</Hint>
		<Select.Content>
			{#each Object.entries(GROUPS) as [v, l] (v)}<Select.Item value={v}>{l}</Select.Item>{/each}
		</Select.Content>
	</Select.Root>
	<Select.Root type="single" value={sortBy} onValueChange={(v) => (sortBy = v as Sort)}>
		<Hint text={m.sort_all_columns()}>
			{#snippet children(props)}
				<Select.Trigger {...props} class="w-72">
					<span class="flex items-center gap-2"
						><ArrowDownUp class="text-muted-foreground" /><span class="text-muted-foreground">{m.sort()}</span>{SORTS[
							sortBy
						]}</span
					>
				</Select.Trigger>
			{/snippet}
		</Hint>
		<Select.Content>
			{#each Object.entries(SORTS) as [v, l] (v)}<Select.Item value={v}>{l}</Select.Item>{/each}
		</Select.Content>
	</Select.Root>
	<Button disabled={!data.canEdit} onclick={() => dialog.open()}><Plus /> {m.ticket()}</Button>
</div>

<Collapsible.Root bind:open={showTimeline} class="mb-4 border-b">
	<Collapsible.Trigger
		class="group hover:bg-muted mx-5 mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold"
	>
		<ChevronRight class="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-90" />
		<ChartGantt class="size-4" />
		{m.schedule()} <span class="text-muted-foreground text-xs font-medium">{m.scheduled({ value1: scheduled })}</span>
	</Collapsible.Trigger>
	<Collapsible.Content>
		<Gantt
			readOnly={!data.canEdit}
			tickets={data.tickets}
			dependencies={data.dependencies}
			columns={data.columns}
			projectKey={data.project.key}
			color={data.project.color}
			resizable
			bind:height={timelineHeight}
		/>
	</Collapsible.Content>
</Collapsible.Root>

{#if groupBy === 'none'}
	<div class="flex min-h-[calc(100vh-200px)] items-start gap-3.5 overflow-x-auto px-5 pb-5">
		{#each data.columns as col (col.id)}
			{@render columnCell(lanes[0], col, false)}
		{/each}
	</div>
{:else}
	<div class="overflow-x-auto px-5 pb-5">
		<div class="flex w-max min-w-full flex-col gap-2">
			<!-- Spaltenköpfe einmal oben, beim Scrollen sichtbar -->
			<div class="bg-background sticky top-0 z-10 flex gap-3.5 pb-1">
				{#each data.columns as col (col.id)}
					<div class="w-72 shrink-0">{@render columnHeader(col, null)}</div>
				{/each}
			</div>
			{#each shownLanes as lane (lane.key)}
				{@const open = !collapsedLanes.has(lane.key)}
				<div class="group/lane flex flex-col gap-1.5">
					<Button
						variant="ghost"
						size="sm"
						class="sticky left-0 w-fit gap-2 font-semibold"
						aria-expanded={open}
						onclick={() => toggleLane(lane.key)}
					>
						<ChevronRight class={cn('text-muted-foreground size-4 transition-transform', open && 'rotate-90')} />
						{#if lane.kind === 'tag' && lane.color}
							<TagBadge name={lane.label} color={lane.color} />
						{:else if lane.kind === 'assignee'}
							<UserAvatar name={lane.userName} size="sm" />{lane.label}
						{:else if lane.kind === 'priority'}
							<span class="prio prio-{lane.priority}"></span>{lane.label}
						{:else}
							<span class="text-muted-foreground">{lane.label}</span>
						{/if}
						<span class="text-muted-foreground text-xs font-medium">{laneCount(lane)}</span>
					</Button>
					{#if open}
						<div class="flex items-start gap-3.5 border-b pb-3">
							{#each data.columns as col (col.id)}
								{@render columnCell(lane, col, true)}
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<p class="text-muted-foreground px-2 py-6 text-sm">{m.no_tickets_match_these_filters()}</p>
			{/each}
		</div>
	</div>
{/if}

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	tags={data.tags}
	parents={data.tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` }))}
/>
