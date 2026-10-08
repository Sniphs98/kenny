<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, PRIORITY_LABELS } from '$lib/api';
	import TicketDialog from '$lib/components/TicketDialog.svelte';

	let { data } = $props();

	type Item = (typeof data.tickets)[number];

	let search = $state('');
	let showSubtasks = $state(false);
	let error = $state('');
	let dialog: TicketDialog;

	// Lokale Kopie, damit Drag & Drop sofort sichtbar ist
	let tickets = $state<Item[]>([]);
	$effect(() => {
		tickets = data.tickets.map((t) => ({ ...t }));
	});

	const byId = $derived(new Map(data.tickets.map((t) => [t.id, t])));

	const visible = $derived(
		tickets.filter(
			(t) =>
				(showSubtasks || t.parentId === null) &&
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
			error = (err as Error).message;
		}
		await invalidateAll();
	}

	function onDragEnd() {
		dragId = null;
		dropTarget = null;
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
			error = (err as Error).message;
		}
	}

	function initials(name: string | null) {
		return (name ?? '')
			.split(/\s+/)
			.map((p) => p[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	function overdue(t: Item) {
		return !t.closed && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
	}
</script>

<div class="toolbar row">
	<input class="search" placeholder="Suchen…" bind:value={search} />
	<label class="inline"><input type="checkbox" bind:checked={showSubtasks} /> Unteraufgaben anzeigen</label>
	<span class="grow"></span>
	{#if error}<span class="error">{error}</span>{/if}
	<button class="primary" onclick={() => dialog.open()}>+ Ticket</button>
</div>

<div class="board">
	{#each data.columns as col (col.id)}
		{@const list = columnTickets(col.id)}
		<section class="column" class:done={col.isDone}>
			<header class="row">
				<strong class="grow">{col.name}</strong>
				<span class="badge">{list.length}</span>
			</header>
			<div
				class="cards"
				role="region"
				aria-label={col.name}
				ondragover={(e) => onDragOver(e, col.id, e.currentTarget as HTMLElement)}
				ondrop={onDrop}
			>
				{#each list as t, i (t.id)}
					{#if dropTarget?.columnId === col.id && dropTarget.index === i && dragId !== t.id}
						<div class="placeholder"></div>
					{/if}
					<a
						href="/tickets/{t.key}"
						class="tcard card"
						class:dragging={dragId === t.id}
						data-card={t.id}
						draggable="true"
						ondragstart={(e) => onDragStart(e, t)}
						ondragend={onDragEnd}
					>
						<div class="row">
							<span class="prio prio-{t.priority}" title={PRIORITY_LABELS[t.priority]}></span>
							<span class="key grow">{t.key}</span>
							{#if t.assigneeName}<span class="avatar" title={t.assigneeName}>{initials(t.assigneeName)}</span>{/if}
						</div>
						<div class="title" class:closed-title={t.closed}>{t.title}</div>
						{#if t.parentId && byId.get(t.parentId)}
							<div class="muted small">↳ {byId.get(t.parentId)?.key}</div>
						{/if}
						<div class="row meta">
							{#if t.subtaskCount > 0}
								<span class="badge" class:ok={t.subtaskDone === t.subtaskCount}>☑ {t.subtaskDone}/{t.subtaskCount}</span>
							{/if}
							{#if t.openBlockers > 0 && !t.closed}
								<span class="badge warn" title="Wartet auf andere Tickets">⛔ blockiert ({t.openBlockers})</span>
							{/if}
							{#if t.dueDate}
								<span class="badge" class:warn={overdue(t)}>📅 {new Date(t.dueDate).toLocaleDateString('de-DE')}</span>
							{/if}
						</div>
					</a>
				{/each}
				{#if dropTarget?.columnId === col.id && dropTarget.index >= list.filter((t) => t.id !== dragId).length}
					<div class="placeholder"></div>
				{/if}
			</div>
			{#if quickColumn === col.id}
				<form onsubmit={(e) => quickAdd(e, col.id)}>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						autofocus
						placeholder="Titel, Enter zum Anlegen"
						bind:value={quickTitle}
						onblur={() => !quickTitle && (quickColumn = null)}
						onkeydown={(e) => e.key === 'Escape' && (quickColumn = null)}
					/>
				</form>
			{:else}
				<button class="ghost add" onclick={() => ((quickColumn = col.id), (quickTitle = ''))}>+ Ticket hinzufügen</button>
			{/if}
		</section>
	{/each}
</div>

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	parents={data.tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` }))}
/>

<style>
	.toolbar {
		padding: 0.75rem 1rem;
		flex-wrap: wrap;
	}
	.search {
		width: 220px;
	}
	.board {
		display: flex;
		gap: 0.75rem;
		padding: 0 1rem 1rem;
		overflow-x: auto;
		align-items: flex-start;
		min-height: calc(100vh - 190px);
	}
	.column {
		flex: 0 0 280px;
		background: var(--surface-2);
		border-radius: var(--radius);
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: calc(100vh - 200px);
	}
	.column header {
		padding: 0.25rem 0.4rem;
	}
	.column.done header strong::after {
		content: ' ✓';
		color: var(--ok);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 40px;
		overflow-y: auto;
	}
	.tcard {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.6rem 0.7rem;
		color: var(--text);
		cursor: grab;
	}
	.tcard:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.tcard.dragging {
		opacity: 0.4;
	}
	.title {
		font-weight: 500;
		word-break: break-word;
	}
	.meta {
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.meta:empty {
		display: none;
	}
	.small {
		font-size: 0.8rem;
	}
	.avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 0.65rem;
		display: grid;
		place-items: center;
		font-weight: 600;
	}
	.placeholder {
		height: 4px;
		border-radius: 2px;
		background: var(--accent);
	}
	.add {
		color: var(--muted);
		justify-content: flex-start;
	}
</style>
