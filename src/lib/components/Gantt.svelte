<script lang="ts">
	import { intlLocale } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import type { UpdateTicketInput } from '$lib/contracts';
	import { invalidateAll } from '$app/navigation';
	import { createTicket, updateTicket } from '$lib/api';
	import { openTicket } from '$lib/ticket-modal';
	import Hint, { chain, cursorAnchor } from '$lib/components/Hint.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { toast } from 'svelte-sonner';
	import type { BoardColumnDto, DependencyDto, TicketListItem } from '$lib/contracts';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Info from '@lucide/svelte/icons/info';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Plus from '@lucide/svelte/icons/plus';
	import Archive from '@lucide/svelte/icons/archive';
	import CalendarX from '@lucide/svelte/icons/calendar-x';
	import X from '@lucide/svelte/icons/x';
	import { tick, untrack, type Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	type Item = TicketListItem;

	let {
		tickets: source,
		dependencies,
		columns,
		projectKey,
		color,
		maxHeight = 'calc(100vh - 210px)',
		resizable = false,
		height = $bindable(360),
		actions
	}: {
		tickets: Item[];
		dependencies: DependencyDto[];
		/** Board-Spalten; Tickets in Backlog-Spalten sind standardmäßig ausgeblendet */
		columns: BoardColumnDto[];
		/** Für das Anlegen neuer Tickets aus der Einplanen-Suche */
		projectKey: string;
		color: string;
		/** Maximale Höhe des Diagramms, danach wird gescrollt */
		maxHeight?: string;
		/** Höhe per Griff unten am Diagramm einstellbar; ersetzt dann maxHeight */
		resizable?: boolean;
		/** Eingestellte Höhe in px (nur mit resizable) */
		height?: number;
		/** Zusätzliche Buttons rechts in der Werkzeugleiste */
		actions?: Snippet;
	} = $props();

	const DAY = 86_400_000;
	const ROW = 34;
	const ZOOMS = { day: 36, week: 16, month: 6 } as const;

	let zoom = $state<keyof typeof ZOOMS>('week');
	let hideClosed = $state(false);
	let showBacklog = $state(false);
	/** Tickets ohne Termin standardmäßig ausblenden; eingeplant wird über „Ticket einplanen…“ */
	let showUndated = $state(false);

	const backlogColumns = $derived(new Set(columns.filter((c) => c.isBacklog).map((c) => c.id)));
	const backlogCount = $derived(source.filter((t) => backlogColumns.has(t.columnId)).length);

	const px = $derived(ZOOMS[zoom]);

	const toDay = (s: string) => Math.round(Date.parse(s + 'T00:00:00Z') / DAY);
	const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
	const today = Math.floor(Date.now() / DAY);

	// Lokale Kopie, damit Ziehen von Balken sofort sichtbar ist
	let tickets = $state<Item[]>([]);
	$effect(() => {
		const next = source;
		// Während des Ziehens kein Live-Update übernehmen, sonst folgt der Balken nicht mehr der Maus.
		// untrack: Das Ende des Ziehens allein löst kein Zurücksetzen aus (erst die neuen Daten).
		if (untrack(() => dragging)) return;
		tickets = next.map((t) => ({ ...t }));
	});

	/** Tickets mit aufgeklappten Unteraufgaben; standardmäßig sind alle zugeklappt */
	const expanded = new SvelteSet<number>();

	function toggle(id: number) {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	/** Tickets hierarchisch sortieren: Eltern, darunter ihre (aufgeklappten) Unteraufgaben */
	const tree = $derived.by(() => {
		let list = tickets.filter((t) => (!hideClosed || !t.closed) && (showBacklog || !backlogColumns.has(t.columnId)));
		if (!showUndated) {
			// Nur Tickets mit Termin, dazu ihre Elterntickets, damit die Hierarchie erhalten bleibt
			const byId = new Map(list.map((t) => [t.id, t]));
			const keep = new Set<number>();
			for (const t of list) {
				if (!t.startDate && !t.dueDate) continue;
				for (
					let cur: Item | undefined = t;
					cur && !keep.has(cur.id);
					cur = cur.parentId ? byId.get(cur.parentId) : undefined
				)
					keep.add(cur.id);
			}
			list = list.filter((t) => keep.has(t.id));
		}
		const ids = new Set(list.map((t) => t.id));
		const children = new Map<number | null, Item[]>();
		for (const t of list) {
			const parent = t.parentId !== null && ids.has(t.parentId) ? t.parentId : null;
			if (!children.has(parent)) children.set(parent, []);
			children.get(parent)!.push(t);
		}
		const sortKey = (t: Item) => (t.startDate ?? t.dueDate ?? '9999') + String(t.number).padStart(6, '0');
		const out: { t: Item; depth: number; childCount: number }[] = [];
		const walk = (parent: number | null, depth: number) => {
			for (const t of (children.get(parent) ?? []).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) {
				const childCount = children.get(t.id)?.length ?? 0;
				out.push({ t, depth, childCount });
				if (expanded.has(t.id)) walk(t.id, depth + 1);
			}
		};
		walk(null, 0);
		return { rows: out, parents: [...children.keys()].filter((id) => id !== null) };
	});
	const rows = $derived(tree.rows);
	const allExpanded = $derived(tree.parents.length > 0 && tree.parents.every((id) => expanded.has(id)));

	function toggleAll() {
		if (allExpanded) expanded.clear();
		else for (const id of tree.parents) expanded.add(id);
	}

	function span(t: Item) {
		if (!t.startDate && !t.dueDate) return null;
		const s = toDay(t.startDate ?? t.dueDate!);
		const e = toDay(t.dueDate ?? t.startDate!);
		return { start: s, end: e };
	}

	// Sichtbarer Zeitraum
	const range = $derived.by(() => {
		let min = today - 7;
		let max = today + 30;
		for (const { t } of rows) {
			const s = span(t);
			if (!s) continue;
			min = Math.min(min, s.start - 7);
			max = Math.max(max, s.end + 14);
		}
		// Breite auffüllen, aber abrunden: sonst ist das Diagramm immer etwas zu breit und zeigt eine Scrollleiste
		const minDays = Math.floor((width - 280) / px);
		return { start: min, days: Math.max(max - min + 1, minDays) };
	});

	const x = (day: number) => (day - range.start) * px;

	const months = $derived.by(() => {
		const out: { label: string; left: number; width: number }[] = [];
		let d = range.start;
		const end = range.start + range.days;
		while (d < end) {
			const date = new Date(d * DAY);
			const next = Math.min(end, Math.round(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / DAY));
			out.push({
				label: date.toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }),
				left: x(d),
				width: (next - d) * px
			});
			d = next;
		}
		return out;
	});

	const days = $derived(Array.from({ length: range.days }, (_, i) => range.start + i));

	function dayLabel(d: number) {
		const date = new Date(d * DAY);
		if (zoom === 'day') return String(date.getUTCDate());
		if (zoom === 'week' && date.getUTCDay() === 1) return String(date.getUTCDate());
		return '';
	}
	const isWeekend = (d: number) => [0, 6].includes(new Date(d * DAY).getUTCDay());

	// Abhängigkeitspfeile: vom Ende der Voraussetzung zum Start des abhängigen Tickets
	const arrows = $derived.by(() => {
		const index = new Map(rows.map((r, i) => [r.t.id, i]));
		return dependencies.flatMap((d) => {
			const si = index.get(d.sourceId);
			const ti = index.get(d.targetId);
			if (si === undefined || ti === undefined) return [];
			const s = span(rows[si].t);
			const t = span(rows[ti].t);
			if (!s || !t) return [];
			const x1 = x(t.end + 1);
			const y1 = ti * ROW + ROW / 2;
			const x2 = x(s.start);
			const y2 = si * ROW + ROW / 2;
			const half = (ROW - 12) / 2;
			let path: string;
			if (x2 >= x1 + 12) {
				// genug Platz: rechts aus dem Balken heraus und zum Start des Folgetickets
				path = `M${x1},${y1} H${x1 + 6} V${y2} H${x2}`;
			} else if (x2 >= x1 - px / 2) {
				// Folgeticket beginnt direkt danach: vom Balkenende senkrecht nach unten/oben
				const xa = Math.max(x1 - Math.min(10, px / 2), x(t.start) + 2);
				path = `M${xa},${y1 + (si > ti ? half : -half)} V${y2} H${x2}`;
			} else {
				// Überschneidung: Umweg zeichnen
				path = `M${x1},${y1} h8 V${(y1 + y2) / 2} H${x2 - 8} V${y2} H${x2}`;
			}
			return [{ id: d.id, path, violated: s.start <= t.end }];
		});
	});

	// --- Balken ziehen / Größe ändern ---
	let drag: {
		t: Item;
		mode: 'move' | 'start' | 'end';
		startX: number;
		orig: { start: number; end: number };
		moved: boolean;
	} | null = null;
	/** Reaktiv, damit Tooltips während des Ziehens aus sind */
	let dragging = $state(false);
	// Tooltips auf breiten Zeilen erscheinen am Mauszeiger statt mittig über der Zeile
	const rowCursor = cursorAnchor();
	const planCursor = cursorAnchor();
	const resizeCursor = cursorAnchor();

	function pointerDown(e: PointerEvent, t: Item, mode: 'move' | 'start' | 'end') {
		const s = span(t);
		if (!s) return;
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { t, mode, startX: e.clientX, orig: s, moved: false };
		dragging = true;
	}

	function pointerMove(e: PointerEvent) {
		if (!drag) return;
		const delta = Math.round((e.clientX - drag.startX) / px);
		if (delta !== 0) drag.moved = true;
		let { start, end } = drag.orig;
		if (drag.mode === 'move') {
			start += delta;
			end += delta;
		} else if (drag.mode === 'start') start = Math.min(end, start + delta);
		else end = Math.max(start, end + delta);
		drag.t.startDate = fromDay(start);
		drag.t.dueDate = fromDay(end);
	}

	async function pointerUp() {
		if (!drag) return;
		const { t, moved } = drag;
		drag = null;
		dragging = false;
		if (!moved) {
			openTicket(t.key);
			return;
		}
		try {
			await updateTicket(t.id, { startDate: t.startDate, dueDate: t.dueDate });
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	/** Klick in eine leere Zeile setzt Start- und Enddatum für Tickets ohne Termin */
	async function setDates(e: MouseEvent, t: Item) {
		if (span(t)) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const day = range.start + Math.floor((e.clientX - rect.left) / px);
		try {
			await updateTicket(t.id, { startDate: fromDay(day), dueDate: fromDay(day + 2) });
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	// --- Tickets einplanen: Suche in der letzten Zeile, z.B. um Tickets aus dem Backlog zu terminieren ---
	let planOpen = $state(false);
	let planQuery = $state('');
	/** Angeklickter Tag in der Zeitachse; ohne Klick wird ab heute geplant */
	let planDay = $state<number | null>(null);
	let hoverDay = $state<number | null>(null);
	let planAnchor = $state<HTMLButtonElement | null>(null);
	let planCell = $state<HTMLDivElement | null>(null);

	/** Noch nicht eingeplante offene Tickets: ohne Termin oder im Backlog; Backlog zuerst */
	const planCandidates = $derived(
		source
			.filter((t) => !t.closed)
			.map((t) => ({ t, backlog: backlogColumns.has(t.columnId), dated: !!(t.startDate || t.dueDate) }))
			.filter(({ backlog, dated }) => backlog || !dated)
			.sort((a, b) => Number(b.backlog) - Number(a.backlog) || a.t.number - b.t.number)
	);
	const canCreatePlan = $derived(
		planQuery.trim() !== '' && !source.some((t) => t.title.toLowerCase() === planQuery.trim().toLowerCase())
	);

	function openPlan(e: MouseEvent | null) {
		if (e) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			planDay = range.start + Math.floor((e.clientX - rect.left) / px);
		} else planDay = null;
		planQuery = '';
		planOpen = true;
	}

	const backlogColumn = $derived(columns.find((c) => c.isBacklog));
	const undatedCount = $derived(source.filter((t) => !t.closed && !t.startDate && !t.dueDate).length);

	/** Termin entfernen; optional zurück in die Backlog-Spalte */
	async function unschedule(t: Item, toBacklog: boolean) {
		const body: UpdateTicketInput = { startDate: null, dueDate: null };
		if (toBacklog && backlogColumn) body.columnId = backlogColumn.id;
		try {
			await updateTicket(t.id, body);
			toast.success(
				toBacklog ? m.moved_back_to_backlog({ value1: t.key }) : m.removed_from_schedule({ value1: t.key })
			);
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	const fmtDay = (d: number) => new Date(d * DAY).toLocaleDateString(intlLocale(), { timeZone: 'UTC' });

	async function plan(t: Item) {
		planOpen = false;
		const start = planDay ?? today;
		const s = span(t);
		// Dauer behalten, wenn das Ticket schon Termine hat
		const body: UpdateTicketInput = { startDate: fromDay(start), dueDate: fromDay(start + (s ? s.end - s.start : 2)) };
		if (backlogColumns.has(t.columnId)) {
			// Aus dem Backlog holen, sonst wäre es im Gantt gleich wieder ausgeblendet
			const target = columns.find((c) => !c.isBacklog && !c.isDone);
			if (target) body.columnId = target.id;
		}
		// Elterntickets aufklappen, damit eine eingeplante Unteraufgabe sichtbar ist
		for (let p = t.parentId; p !== null; p = source.find((x) => x.id === p)?.parentId ?? null) expanded.add(p);
		try {
			await updateTicket(t.id, body);
			toast.success(m.scheduled_from({ value1: t.key, value2: fmtDay(start) }));
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
		await afterPlan(t.id);
	}

	/** Gerade eingeplantes Ticket kurz hervorheben */
	let highlighted = $state<number | null>(null);
	let highlightTimer: ReturnType<typeof setTimeout>;

	/**
	 * Nach dem Einplanen: „Ticket einplanen…“ wieder in den sichtbaren Bereich holen,
	 * damit man direkt das nächste Ticket einplanen kann, und die neue Zeile hervorheben.
	 */
	async function afterPlan(id: number | null) {
		await tick();
		planAnchor?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		if (id === null) return;
		highlighted = id;
		clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => (highlighted = null), 1600);
	}

	async function createPlanned() {
		const title = planQuery.trim();
		planOpen = false;
		const start = planDay ?? today;
		let id: number | null = null;
		try {
			const t = await createTicket(projectKey, {
				title,
				startDate: fromDay(start),
				dueDate: fromDay(start + 2)
			});
			id = t.id;
			toast.success(m.created_and_scheduled_from({ value1: t.key, value2: fmtDay(start) }));
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
		await afterPlan(id);
	}

	// --- Höhe per Griff ändern ---
	const MIN_HEIGHT = 120;
	const DEFAULT_HEIGHT = 360;
	let resizing = $state<{ startY: number; startHeight: number } | null>(null);

	/** Höhe begrenzen: nicht kleiner als MIN_HEIGHT, nicht größer als der Inhalt */
	function clampHeight(h: number) {
		const content = scroller ? scroller.scrollHeight + 2 : Infinity;
		return Math.round(Math.max(MIN_HEIGHT, Math.min(h, content, window.innerHeight - 120)));
	}

	function resizeStart(e: PointerEvent) {
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		// Mit der tatsächlich sichtbaren Höhe starten (kann kleiner sein als height, wenn wenig Zeilen)
		resizing = { startY: e.clientY, startHeight: scroller.clientHeight + 2 };
	}

	function resizeMove(e: PointerEvent) {
		if (!resizing) return;
		height = clampHeight(resizing.startHeight + e.clientY - resizing.startY);
	}

	function resizeKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 80 : 20;
		if (e.key === 'ArrowDown') height = clampHeight(scroller.clientHeight + 2 + step);
		else if (e.key === 'ArrowUp') height = clampHeight(scroller.clientHeight + 2 - step);
		else if (e.key === 'Home') height = MIN_HEIGHT;
		else return;
		e.preventDefault();
	}

	let scroller: HTMLDivElement;
	let width = $state(1000);
	function scrollToToday() {
		scroller?.scrollTo({ left: Math.max(0, x(today) - 200), behavior: 'smooth' });
	}
	$effect(() => {
		const scale = px;
		queueMicrotask(() => {
			if (scale > 0) scrollToToday();
		});
	});
</script>

<svelte:window onpointermove={pointerMove} onpointerup={pointerUp} />

<div class="flex flex-wrap items-center gap-2 px-5 py-3.5">
	<ToggleGroup.Root
		type="single"
		size="sm"
		variant="outline"
		value={zoom}
		onValueChange={(v) => v && (zoom = v as keyof typeof ZOOMS)}
		aria-label={m.zoom()}
	>
		{#each Object.keys(ZOOMS) as z (z)}
			<ToggleGroup.Item value={z} class="px-3"
				>{z === 'day' ? m.day() : z === 'week' ? m.week() : m.month()}</ToggleGroup.Item
			>
		{/each}
	</ToggleGroup.Root>
	<Button variant="outline" size="sm" onclick={scrollToToday}><CalendarDays /> {m.today()}</Button>
	<Label class="ml-1 font-normal"><Checkbox bind:checked={hideClosed} /> {m.hide_completed()}</Label>
	<Label class="ml-1 font-normal">
		<Checkbox bind:checked={showUndated} />
		{m.show_unscheduled()} <span class="text-muted-foreground text-xs">({undatedCount})</span>
	</Label>
	{#if backlogColumns.size}
		<Label class="ml-1 font-normal">
			<Checkbox bind:checked={showBacklog} />
			{m.show_backlog()} <span class="text-muted-foreground text-xs">({backlogCount})</span>
		</Label>
	{/if}
	{#if tree.parents.length}
		<Button variant="ghost" size="sm" onclick={toggleAll}>
			{#if allExpanded}<ChevronsDownUp /> {m.collapse_all()}{:else}<ChevronsUpDown /> {m.expand_all()}{/if}
		</Button>
	{/if}
	<span class="grow"></span>
	<span class="text-muted-foreground flex items-center gap-1.5 text-xs max-lg:hidden">
		<Info class="size-3.5" />
		{m.drag_bars_to_reschedule_drag_edges_to_change_duration()}
	</span>
	{@render actions?.()}
</div>

<div
	class="gantt bg-card rounded-xl border shadow-xs"
	bind:this={scroller}
	bind:clientWidth={width}
	style="--px: {px}px; --row: {ROW}px; --c: var(--primary, {color}); max-height: {resizable
		? `${height}px`
		: maxHeight}"
>
	<div class="grid" style="width: {280 + range.days * px}px">
		<!-- Kopfzeile -->
		<div class="corner">{m.ticket()}</div>
		<div class="timehead" style="width: {range.days * px}px">
			<div class="months">
				{#each months as m (m.left)}
					<div class="month" style="left: {m.left}px; width: {m.width}px">{m.label}</div>
				{/each}
			</div>
			<div class="days">
				{#each days as d (d)}
					<div class="day" class:weekend={isWeekend(d)} class:today={d === today}>{dayLabel(d)}</div>
				{/each}
			</div>
		</div>

		<!-- Ticketliste links -->
		<div class="labels">
			{#each rows as { t, depth, childCount } (t.id)}
				<div class="label" class:highlight={highlighted === t.id} style="padding-left: {0.3 + depth * 1.1}rem">
					{#if childCount}
						<Hint text="{expanded.has(t.id) ? m.collapse_subtasks() : m.expand_subtasks()} ({childCount})">
							{#snippet children(props)}
								<button
									{...props}
									type="button"
									class="toggle"
									class:open={expanded.has(t.id)}
									aria-expanded={expanded.has(t.id)}
									aria-label="{expanded.has(t.id) ? m.collapse_subtasks() : m.expand_subtasks()} ({childCount})"
									onclick={() => toggle(t.id)}
								>
									<ChevronRight class="size-3.5" />
								</button>
							{/snippet}
						</Hint>
					{:else}
						<span class="toggle"></span>
					{/if}
					<Hint text={t.title} side="right">
						{#snippet children(props)}
							<a {...props} class="link" href="/tickets/{t.key}" onclick={(e) => openTicket(t.key, e)}>
								<span class="prio prio-{t.priority}"></span>
								<span class="text-muted-foreground font-mono text-xs">{t.key}</span>
								<span class={['ttl', t.closed && 'text-muted-foreground line-through']}>{t.title}</span>
							</a>
						{/snippet}
					</Hint>
					{#if t.startDate || t.dueDate || (backlogColumn && t.columnId !== backlogColumn.id)}
						<DropdownMenu.Root>
							<Hint text={m.unschedule()}>
								{#snippet children(props)}
									<DropdownMenu.Trigger {...props} class="rowaction" aria-label={m.unschedule_2({ value1: t.key })}>
										<X class="size-3.5" />
									</DropdownMenu.Trigger>
								{/snippet}
							</Hint>
							<DropdownMenu.Content align="end" class="w-56">
								<DropdownMenu.Label class="truncate">{t.key} {t.title}</DropdownMenu.Label>
								<DropdownMenu.Item disabled={!t.startDate && !t.dueDate} onSelect={() => unschedule(t, false)}>
									<CalendarX />
									{m.remove_from_schedule()}
								</DropdownMenu.Item>
								{#if backlogColumn && t.columnId !== backlogColumn.id}
									<DropdownMenu.Item onSelect={() => unschedule(t, true)}>
										<Archive />
										{m.move_back_to_backlog()}
									</DropdownMenu.Item>
								{/if}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/if}
				</div>
			{/each}
			<button type="button" class="label planlabel" bind:this={planAnchor} onclick={() => openPlan(null)}>
				<span class="toggle"><Plus class="size-3.5" /></span>
				{m.schedule_ticket()}
			</button>
			<Popover.Root bind:open={planOpen}>
				<Popover.Content
					class="w-96 p-0"
					align="start"
					side="top"
					customAnchor={planDay !== null && planCell ? planCell : planAnchor}
				>
					<Command.Root>
						<Command.Input placeholder={m.search_or_create_a_ticket()} bind:value={planQuery} />
						<div class="text-muted-foreground border-b px-3 py-1.5 text-xs">
							{m.schedule_from({ value1: fmtDay(planDay ?? today), value2: planDay === null ? m.today_suffix() : '' })}
						</div>
						<Command.List class="max-h-80">
							{#if !canCreatePlan}<Command.Empty>{m.no_open_unscheduled_tickets_found()}</Command.Empty>{/if}
							<Command.Group>
								{#each planCandidates as { t, backlog, dated } (t.id)}
									<Command.Item value={String(t.id)} keywords={[t.key, t.title]} onSelect={() => plan(t)}>
										<span class="prio prio-{t.priority}"></span>
										<span class="text-muted-foreground shrink-0 font-mono text-xs">{t.key}</span>
										<span class="min-w-0 grow truncate">{t.title}</span>
										{#if backlog}
											<span class="bg-muted text-muted-foreground shrink-0 rounded px-1.5 text-[11px]"
												>{m.backlog()}</span
											>
										{:else if !dated}
											<span class="text-muted-foreground shrink-0 text-[11px]">{m.unscheduled()}</span>
										{/if}
									</Command.Item>
								{/each}
							</Command.Group>
							<!-- Außerhalb der Gruppe: eine Gruppe ohne Treffer wird komplett ausgeblendet -->
							{#if canCreatePlan}
								<Command.Item value="__create" keywords={[planQuery]} forceMount onSelect={createPlanned}>
									<Plus />
									<span class="truncate">{m.create_as_a_new_ticket({ value1: planQuery.trim() })}</span>
								</Command.Item>
							{/if}
						</Command.List>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
		</div>

		<!-- Zeitachse -->
		<div class="body" style="width: {range.days * px}px; height: {(rows.length + 1) * ROW}px">
			<div class="bg">
				{#each days as d (d)}
					<div class="bgday" class:weekend={isWeekend(d)}></div>
				{/each}
			</div>
			<div class="todayline" style="left: {x(today) + px / 2}px"></div>

			{#each rows as { t }, i (t.id)}
				{@const s = span(t)}
				<Hint text={s ? null : m.set_schedule_date()} anchor={rowCursor.anchor}>
					{#snippet children(rowProps)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							{...rowProps}
							class="trow"
							class:nodate={!s}
							class:highlight={highlighted === t.id}
							style="top: {i * ROW}px"
							onclick={(e) => setDates(e, t)}
							onmousemove={rowCursor.track}
							role="presentation"
						>
							{#if s}
								<Hint
									text={m.to({
										value1: t.key,
										value2: t.title,
										value3: t.startDate ?? '?',
										value4: t.dueDate ?? '?'
									})}
									disabled={dragging}
								>
									{#snippet children(props)}
										<div
											{...props}
											class="bar"
											class:closed={t.closed}
											class:blocked={t.openBlockers > 0 && !t.closed}
											class:parent={t.subtaskCount > 0}
											style="left: {x(s.start)}px; width: {(s.end - s.start + 1) * px}px"
											onpointerdown={chain<PointerEvent>(props.onpointerdown, (e) => pointerDown(e, t, 'move'))}
											role="button"
											tabindex="-1"
										>
											{#if t.subtaskCount > 0}
												<div class="progress" style="width: {(t.subtaskDone / t.subtaskCount) * 100}%"></div>
											{/if}
											<span class="handle l" onpointerdown={(e) => pointerDown(e, t, 'start')} role="presentation"
											></span>
											{#if (s.end - s.start + 1) * px >= 70}<span class="btext">{t.title}</span>{/if}
											<span class="handle r" onpointerdown={(e) => pointerDown(e, t, 'end')} role="presentation"></span>
										</div>
									{/snippet}
								</Hint>
								{#if (s.end - s.start + 1) * px < 70}
									<span class="outside" style="left: {x(s.end + 1) + 6}px">{t.title}</span>
								{/if}
							{/if}
						</div>
					{/snippet}
				</Hint>
			{/each}

			<!-- Leere Zeile zum Einplanen: Klick wählt den Starttag -->
			<Hint text={m.click_to_schedule_a_ticket_starting_on_this_day()} anchor={planCursor.anchor} disabled={planOpen}>
				{#snippet children(props)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						{...props}
						class="trow planrow"
						style="top: {rows.length * ROW}px"
						onclick={(e) => openPlan(e)}
						onmousemove={(e) => {
							planCursor.track(e);
							const rect = e.currentTarget.getBoundingClientRect();
							hoverDay = range.start + Math.floor((e.clientX - rect.left) / px);
						}}
						onmouseleave={() => (hoverDay = null)}
						role="presentation"
					>
						{#if planOpen && planDay !== null}
							<!-- Gewählter Tag bleibt markiert, solange die Suche offen ist; die Suche hängt daran -->
							<div
								class="plancell selected"
								bind:this={planCell}
								style="left: {x(planDay)}px; width: {Math.max(px, 18)}px"
							>
								<CalendarPlus class="size-3.5" />
							</div>
						{:else if hoverDay !== null}
							<div class="plancell" style="left: {x(hoverDay)}px; width: {Math.max(px, 18)}px">
								<CalendarPlus class="size-3.5" />
							</div>
						{/if}
					</div>
				{/snippet}
			</Hint>

			<svg class="arrows" width={range.days * px} height={rows.length * ROW}>
				<defs>
					<marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
						<path d="M0,0 L8,4 L0,8 z" fill="var(--muted-foreground)" />
					</marker>
					<marker id="arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
						<path d="M0,0 L8,4 L0,8 z" fill="var(--destructive)" />
					</marker>
				</defs>
				{#each arrows as a (a.id)}
					<path d={a.path} class:violated={a.violated} marker-end={a.violated ? 'url(#arrow-bad)' : 'url(#arrow)'} />
				{/each}
			</svg>
		</div>
	</div>
</div>

{#if resizable}
	<!-- Griff zum Ändern der Höhe; Doppelklick setzt sie zurück -->
	<!-- Ein fokussierbarer separator ist laut ARIA ein bedienbares Element (Fensterteiler) -->
	<Hint text={m.drag_to_resize_double_click_to_reset()} anchor={resizeCursor.anchor} disabled={!!resizing}>
		{#snippet children(props)}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				{...props}
				class="resize"
				class:active={resizing}
				role="separator"
				aria-orientation="horizontal"
				aria-label={m.resize_schedule()}
				aria-valuenow={height}
				aria-valuemin={MIN_HEIGHT}
				tabindex="0"
				onpointerdown={chain<PointerEvent>(props.onpointerdown, resizeStart)}
				onpointermove={chain<PointerEvent>(props.onpointermove, resizeMove)}
				onpointerup={chain<PointerEvent>(props.onpointerup, () => (resizing = null))}
				onpointercancel={() => (resizing = null)}
				onmousemove={resizeCursor.track}
				ondblclick={() => (height = DEFAULT_HEIGHT)}
				onkeydown={chain<KeyboardEvent>(props.onkeydown, resizeKey)}
			>
				<span></span>
			</div>
		{/snippet}
	</Hint>
{/if}

<style>
	.resize {
		display: grid;
		place-items: center;
		height: 14px;
		margin: -1.25rem 1.25rem 0.5rem;
		cursor: row-resize;
		touch-action: none;
		outline: none;
	}
	.resize span {
		width: 48px;
		height: 4px;
		border-radius: 999px;
		background: var(--border);
		transition:
			background 0.12s,
			width 0.12s;
	}
	.resize:hover span,
	.resize:focus-visible span,
	.resize.active span {
		width: 72px;
		background: var(--primary);
	}
	.gantt {
		margin: 0 1.25rem 1.25rem;
		overflow: auto;
		position: relative;
	}
	.grid {
		display: grid;
		grid-template-columns: 280px 1fr;
		position: relative;
	}
	.corner,
	.labels {
		position: sticky;
		left: 0;
		z-index: 3;
		background: var(--card);
		border-right: 1px solid var(--border);
	}
	.corner {
		top: 0;
		z-index: 5;
		padding: 0 0.6rem;
		display: flex;
		align-items: flex-end;
		padding-bottom: 6px;
		font-weight: 600;
		border-bottom: 1px solid var(--border);
	}
	.timehead {
		position: sticky;
		top: 0;
		z-index: 4;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}
	.months {
		position: relative;
		height: 24px;
	}
	.month {
		position: absolute;
		top: 0;
		height: 24px;
		line-height: 24px;
		padding-left: 6px;
		border-left: 1px solid var(--border);
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		font-size: 0.8rem;
	}
	.days {
		display: flex;
		height: 22px;
	}
	.day {
		flex: 0 0 var(--px);
		font-size: 0.7rem;
		color: var(--muted-foreground);
		text-align: center;
		line-height: 22px;
		overflow: visible;
		white-space: nowrap;
	}
	.day.weekend {
		background: var(--muted);
	}
	.day.today {
		color: var(--destructive);
		font-weight: 700;
	}
	.label {
		height: var(--row);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-right: 0.6rem;
		border-bottom: 1px solid var(--border);
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
	}
	/* Kurzes Aufleuchten der gerade eingeplanten Zeile */
	.highlight {
		animation: flash 1.6s ease-out;
	}
	@keyframes flash {
		0%,
		30% {
			background: color-mix(in srgb, var(--primary) 18%, transparent);
		}
		100% {
			background: transparent;
		}
	}
	.label:hover {
		background: var(--muted);
	}
	.link {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		flex: 1;
		height: 100%;
		color: inherit;
		text-decoration: none;
	}
	.toggle {
		flex: 0 0 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border-radius: 4px;
		color: var(--muted-foreground);
	}
	button.toggle:hover {
		background: color-mix(in srgb, var(--foreground) 10%, transparent);
		color: var(--foreground);
	}
	.toggle :global(svg) {
		transition: transform 0.12s;
	}
	.toggle.open :global(svg) {
		transform: rotate(90deg);
	}
	.ttl {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.body {
		position: relative;
	}
	.bg {
		position: absolute;
		inset: 0;
		display: flex;
	}
	.bgday {
		flex: 0 0 var(--px);
	}
	.bgday.weekend {
		background: var(--muted);
		opacity: 0.6;
	}
	.todayline {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--destructive);
		opacity: 0.6;
		z-index: 1;
	}
	.trow {
		position: absolute;
		left: 0;
		right: 0;
		height: var(--row);
		border-bottom: 1px solid var(--border);
	}
	.trow.nodate {
		cursor: copy;
	}
	.trow.nodate:hover {
		background: color-mix(in srgb, var(--primary) 6%, transparent);
	}
	/* Balken: zart getönt in der (an Hell/Dunkel angepassten) Projektfarbe, damit nichts knallt */
	.bar {
		position: absolute;
		top: 7px;
		height: calc(var(--row) - 14px);
		background: color-mix(in srgb, var(--c) 16%, var(--card));
		border: 1px solid color-mix(in srgb, var(--c) 40%, var(--card));
		border-radius: 8px;
		font-weight: 500;
		color: var(--foreground);
		font-size: 0.75rem;
		display: flex;
		align-items: center;
		cursor: grab;
		overflow: hidden;
		z-index: 2;
		touch-action: none;
		user-select: none;
		min-width: 6px;
		transition: border-color 0.12s;
	}
	.bar:hover {
		border-color: var(--c);
	}
	.bar.parent {
		background: color-mix(in srgb, var(--c) 26%, var(--card));
		border-color: color-mix(in srgb, var(--c) 55%, var(--card));
	}
	.bar.closed {
		background: var(--muted);
		border-color: var(--border);
		color: var(--muted-foreground);
	}
	.bar.blocked {
		border: 1px dashed var(--warning);
	}
	.progress {
		position: absolute;
		inset: 0 auto 0 0;
		background: color-mix(in srgb, var(--c) 30%, transparent);
	}
	.btext {
		position: relative;
		padding: 0 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	.outside {
		position: absolute;
		top: 0;
		line-height: var(--row);
		font-size: 0.75rem;
		color: var(--muted-foreground);
		white-space: nowrap;
		pointer-events: none;
	}
	/* ✕ zum Austragen erscheint erst beim Überfahren der Zeile */
	.label :global(.rowaction) {
		flex: 0 0 22px;
		height: 22px;
		margin-left: auto;
		display: grid;
		place-items: center;
		border-radius: 4px;
		color: var(--muted-foreground);
		opacity: 0;
	}
	.label:hover :global(.rowaction),
	.label :global(.rowaction:focus-visible),
	.label :global(.rowaction[data-state='open']) {
		opacity: 1;
	}
	.label :global(.rowaction:hover) {
		background: color-mix(in srgb, var(--destructive) 12%, transparent);
		color: var(--destructive);
	}
	.planlabel {
		width: 100%;
		/* wie die Ticketzeilen (padding-left 0.3rem), damit das Plus unter dem Pfeil steht */
		padding-left: 0.3rem;
		outline: none;
		color: var(--muted-foreground);
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
	}
	.planlabel:hover {
		color: var(--foreground);
	}
	.planlabel:focus-visible {
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--ring) 50%, transparent);
	}
	.planrow {
		cursor: copy;
		border-bottom: none;
	}
	.planrow:hover {
		background: color-mix(in srgb, var(--primary) 5%, transparent);
	}
	.plancell {
		position: absolute;
		top: 7px;
		height: calc(var(--row) - 14px);
		display: grid;
		place-items: center;
		border: 1px dashed color-mix(in srgb, var(--primary) 55%, transparent);
		border-radius: 6px;
		color: var(--primary);
		pointer-events: none;
	}
	.plancell.selected {
		border-style: solid;
		background: color-mix(in srgb, var(--primary) 12%, transparent);
	}
	.handle {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 7px;
		cursor: ew-resize;
		z-index: 1;
	}
	.handle.l {
		left: 0;
	}
	.handle.r {
		right: 0;
	}
	.handle:hover {
		background: color-mix(in srgb, var(--c) 35%, transparent);
	}
	.arrows {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
	}
	.arrows path {
		fill: none;
		stroke: var(--muted-foreground);
		stroke-width: 1.5;
	}
	.arrows path.violated {
		stroke: var(--destructive);
	}
</style>
