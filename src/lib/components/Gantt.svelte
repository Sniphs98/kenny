<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';
	import { openTicket } from '$lib/ticket-modal';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { toast } from 'svelte-sonner';
	import type { listDependencies, listTickets } from '$lib/server/services/tickets';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Info from '@lucide/svelte/icons/info';
	import type { Snippet } from 'svelte';

	type Item = ReturnType<typeof listTickets>[number];

	let {
		tickets: source,
		dependencies,
		color,
		maxHeight = 'calc(100vh - 210px)',
		actions
	}: {
		tickets: Item[];
		dependencies: ReturnType<typeof listDependencies>;
		color: string;
		/** Maximale Höhe des Diagramms, danach wird gescrollt */
		maxHeight?: string;
		/** Zusätzliche Buttons rechts in der Werkzeugleiste */
		actions?: Snippet;
	} = $props();

	const DAY = 86_400_000;
	const ROW = 34;
	const ZOOMS = { Tag: 36, Woche: 16, Monat: 6 } as const;

	let zoom = $state<keyof typeof ZOOMS>('Woche');
	let hideClosed = $state(false);

	const px = $derived(ZOOMS[zoom]);

	const toDay = (s: string) => Math.round(Date.parse(s + 'T00:00:00Z') / DAY);
	const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
	const today = Math.floor(Date.now() / DAY);

	// Lokale Kopie, damit Ziehen von Balken sofort sichtbar ist
	let tickets = $state<Item[]>([]);
	$effect(() => {
		tickets = source.map((t) => ({ ...t }));
	});

	/** Tickets hierarchisch sortieren: Eltern, darunter ihre Unteraufgaben */
	const rows = $derived.by(() => {
		const list = tickets.filter((t) => !hideClosed || !t.closed);
		const ids = new Set(list.map((t) => t.id));
		const children = new Map<number | null, Item[]>();
		for (const t of list) {
			const parent = t.parentId !== null && ids.has(t.parentId) ? t.parentId : null;
			if (!children.has(parent)) children.set(parent, []);
			children.get(parent)!.push(t);
		}
		const sortKey = (t: Item) => (t.startDate ?? t.dueDate ?? '9999') + String(t.number).padStart(6, '0');
		const out: { t: Item; depth: number }[] = [];
		const walk = (parent: number | null, depth: number) => {
			for (const t of (children.get(parent) ?? []).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) {
				out.push({ t, depth });
				walk(t.id, depth + 1);
			}
		};
		walk(null, 0);
		return out;
	});

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
		const minDays = Math.ceil((width - 280) / px) + 1;
		return { start: min, days: Math.max(max - min + 1, minDays) };
	});

	const x = (day: number) => (day - range.start) * px;

	const months = $derived.by(() => {
		const out: { label: string; left: number; width: number }[] = [];
		let d = range.start;
		const end = range.start + range.days;
		while (d < end) {
			const date = new Date(d * DAY);
			const next = Math.min(
				end,
				Math.round(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / DAY)
			);
			out.push({
				label: date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
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
		if (zoom === 'Tag') return String(date.getUTCDate());
		if (zoom === 'Woche' && date.getUTCDay() === 1) return String(date.getUTCDate());
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

	function pointerDown(e: PointerEvent, t: Item, mode: 'move' | 'start' | 'end') {
		const s = span(t);
		if (!s) return;
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { t, mode, startX: e.clientX, orig: s, moved: false };
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
		if (!moved) {
			openTicket(t.key);
			return;
		}
		try {
			await api('PATCH', `/tickets/${t.id}`, { startDate: t.startDate, dueDate: t.dueDate });
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
			await api('PATCH', `/tickets/${t.id}`, { startDate: fromDay(day), dueDate: fromDay(day + 2) });
		} catch (err) {
			toast.error((err as Error).message);
		}
		await invalidateAll();
	}

	let scroller: HTMLDivElement;
	let width = $state(1000);
	function scrollToToday() {
		scroller?.scrollTo({ left: Math.max(0, x(today) - 200), behavior: 'smooth' });
	}
	$effect(() => {
		px;
		queueMicrotask(scrollToToday);
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
		aria-label="Zoom"
	>
		{#each Object.keys(ZOOMS) as z (z)}
			<ToggleGroup.Item value={z} class="px-3">{z}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
	<Button variant="outline" size="sm" onclick={scrollToToday}><CalendarDays /> Heute</Button>
	<Label class="ml-1 font-normal"><Checkbox bind:checked={hideClosed} /> Erledigte ausblenden</Label>
	<span class="grow"></span>
	<span class="text-muted-foreground flex items-center gap-1.5 text-xs max-lg:hidden">
		<Info class="size-3.5" /> Balken ziehen zum Verschieben, Ränder ziehen für die Dauer
	</span>
	{@render actions?.()}
</div>

<div
	class="gantt bg-card rounded-xl border shadow-xs"
	bind:this={scroller}
	bind:clientWidth={width}
	style="--px: {px}px; --row: {ROW}px; --c: var(--primary, {color}); max-height: {maxHeight}"
>
	<div class="grid" style="width: {280 + range.days * px}px">
		<!-- Kopfzeile -->
		<div class="corner">Ticket</div>
		<div class="timehead" style="width: {range.days * px}px">
			<div class="months">
				{#each months as m}
					<div class="month" style="left: {m.left}px; width: {m.width}px">{m.label}</div>
				{/each}
			</div>
			<div class="days">
				{#each days as d}
					<div class="day" class:weekend={isWeekend(d)} class:today={d === today}>{dayLabel(d)}</div>
				{/each}
			</div>
		</div>

		<!-- Ticketliste links -->
		<div class="labels">
			{#each rows as { t, depth } (t.id)}
				<a class="label" href="/tickets/{t.key}" onclick={(e) => openTicket(t.key, e)} style="padding-left: {0.6 + depth * 1.1}rem" title={t.title}>
					<span class="prio prio-{t.priority}"></span>
					<span class="text-muted-foreground font-mono text-xs">{t.key}</span>
					<span class={['ttl', t.closed && 'text-muted-foreground line-through']}>{t.title}</span>
				</a>
			{/each}
			{#if rows.length === 0}
				<div class="label text-muted-foreground">Noch keine Tickets</div>
			{/if}
		</div>

		<!-- Zeitachse -->
		<div class="body" style="width: {range.days * px}px; height: {Math.max(1, rows.length) * ROW}px">
			<div class="bg">
				{#each days as d}
					<div class="bgday" class:weekend={isWeekend(d)}></div>
				{/each}
			</div>
			<div class="todayline" style="left: {x(today) + px / 2}px"></div>

			{#each rows as { t }, i (t.id)}
				{@const s = span(t)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="trow"
					class:nodate={!s}
					style="top: {i * ROW}px"
					onclick={(e) => setDates(e, t)}
					role="presentation"
					title={s ? '' : 'Klicken, um Termin zu setzen'}
				>
					{#if s}
						<div
							class="bar"
							class:closed={t.closed}
							class:blocked={t.openBlockers > 0 && !t.closed}
							class:parent={t.subtaskCount > 0}
							style="left: {x(s.start)}px; width: {(s.end - s.start + 1) * px}px"
							onpointerdown={(e) => pointerDown(e, t, 'move')}
							role="button"
							tabindex="-1"
							title="{t.key}: {t.title} ({t.startDate ?? '?'} bis {t.dueDate ?? '?'})"
						>
							{#if t.subtaskCount > 0}
								<div class="progress" style="width: {(t.subtaskDone / t.subtaskCount) * 100}%"></div>
							{/if}
							<span class="handle l" onpointerdown={(e) => pointerDown(e, t, 'start')} role="presentation"></span>
							{#if (s.end - s.start + 1) * px >= 70}<span class="btext">{t.title}</span>{/if}
							<span class="handle r" onpointerdown={(e) => pointerDown(e, t, 'end')} role="presentation"></span>
						</div>
						{#if (s.end - s.start + 1) * px < 70}
							<span class="outside" style="left: {x(s.end + 1) + 6}px">{t.title}</span>
						{/if}
					{/if}
				</div>
			{/each}

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
					<path
						d={a.path}
						class:violated={a.violated}
						marker-end={a.violated ? 'url(#arrow-bad)' : 'url(#arrow)'}
					/>
				{/each}
			</svg>
		</div>
	</div>
</div>

<style>
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
	.label:hover {
		background: var(--muted);
		text-decoration: none;
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
