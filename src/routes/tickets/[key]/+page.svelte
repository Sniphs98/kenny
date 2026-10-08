<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, PRIORITY_LABELS } from '$lib/api';

	let { data } = $props();

	const t = $derived(data.ticket);
	const base = $derived(`/tickets/${data.ticket.id}`);

	let title = $state('');
	let description = $state('');
	let editingDesc = $state(false);
	$effect(() => {
		title = data.ticket.title;
		description = data.ticket.description;
	});

	let error = $state('');
	let newSubtask = $state('');
	let linkType = $state<'depends_on' | 'blocks' | 'relates'>('depends_on');
	let linkTarget = $state('');

	async function run(fn: () => Promise<unknown>) {
		error = '';
		try {
			await fn();
			await invalidateAll();
		} catch (err) {
			error = (err as Error).message;
		}
	}

	const patch = (body: Record<string, unknown>) => run(() => api('PATCH', base, body));

	async function saveTitle() {
		if (title.trim() && title !== t.title) await patch({ title });
	}

	async function saveDescription() {
		await patch({ description });
		editingDesc = false;
	}

	async function addSubtask(e: SubmitEvent) {
		e.preventDefault();
		if (!newSubtask.trim()) return;
		await run(() => api('POST', `${base}/subtasks`, { title: newSubtask }));
		newSubtask = '';
	}

	async function addLink(e: SubmitEvent) {
		e.preventDefault();
		if (!linkTarget.trim()) return;
		await run(() => api('POST', `${base}/links`, { type: linkType, target: linkTarget.trim() }));
		linkTarget = '';
	}

	async function remove() {
		const extra = data.subtasks.length ? ` und ${data.subtasks.length} Unteraufgabe(n)` : '';
		if (!confirm(`Ticket ${t.key}${extra} löschen?`)) return;
		await api('DELETE', base);
		await goto(`/projects/${data.project.key}/board`, { invalidateAll: true });
	}

	const groups = $derived([
		{ label: 'Setzt voraus', items: data.links.filter((l) => l.relation === 'depends_on') },
		{ label: 'Ist Voraussetzung für', items: data.links.filter((l) => l.relation === 'blocks') },
		{ label: 'Verknüpft mit', items: data.links.filter((l) => l.relation === 'relates') }
	]);
	const openBlockers = $derived(data.links.filter((l) => l.relation === 'depends_on' && !l.ticket.closed));
	const linkCandidates = $derived(data.projectTickets.filter((o) => o.id !== t.id));
	const parentCandidates = $derived(
		data.projectTickets.filter((o) => o.id !== t.id && !data.subtasks.some((s) => s.id === o.id))
	);
	const subDone = $derived(data.subtasks.filter((s) => s.closed).length);
</script>

<svelte:head><title>{t.key} {t.title} · Kenny</title></svelte:head>

<div class="page">
	<div class="crumbs muted">
		<a href="/projects/{data.project.key}/board">{data.project.name}</a>
		{#if data.parent}
			/ <a href="/tickets/{data.parent.key}">{data.parent.key} {data.parent.title}</a>
		{/if}
		/ <span class="key">{t.key}</span>
	</div>

	{#if error}<p class="error">{error}</p>{/if}

	<div class="layout">
		<div class="main stack">
			<input
				class="title-input"
				bind:value={title}
				onblur={saveTitle}
				onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			/>

			{#if t.closed}
				<div class="banner ok">Abgeschlossen am {new Date(t.closedAt!).toLocaleString('de-DE')}</div>
			{:else if openBlockers.length}
				<div class="banner warn">
					Wartet auf {openBlockers.length} offene{openBlockers.length === 1 ? 's' : ''} Ticket{openBlockers.length === 1 ? '' : 's'}:
					{#each openBlockers as b, i}<a href="/tickets/{b.ticket.key}">{b.ticket.key}</a>{i < openBlockers.length - 1 ? ', ' : ''}{/each}
				</div>
			{/if}

			<section class="card section">
				<div class="row">
					<h3 class="grow">Beschreibung</h3>
					{#if !editingDesc}<button class="ghost" onclick={() => (editingDesc = true)}>Bearbeiten</button>{/if}
				</div>
				{#if editingDesc}
					<textarea bind:value={description} rows="8"></textarea>
					<div class="row" style="margin-top: 0.5rem">
						<button class="primary" onclick={saveDescription}>Speichern</button>
						<button onclick={() => ((editingDesc = false), (description = t.description))}>Abbrechen</button>
					</div>
				{:else if t.description}
					<p class="desc">{t.description}</p>
				{:else}
					<p class="muted">Keine Beschreibung.</p>
				{/if}
			</section>

			<section class="card section">
				<div class="row">
					<h3 class="grow">Unteraufgaben</h3>
					{#if data.subtasks.length}<span class="badge" class:ok={subDone === data.subtasks.length}>{subDone}/{data.subtasks.length}</span>{/if}
				</div>
				<ul class="list">
					{#each data.subtasks as s (s.id)}
						<li class="row">
							<input
								type="checkbox"
								checked={s.closed}
								onchange={() => run(() => api('POST', `/tickets/${s.id}/${s.closed ? 'reopen' : 'close'}`))}
							/>
							<a href="/tickets/{s.key}" class="grow" class:closed-title={s.closed}>
								<span class="key">{s.key}</span>
								{s.title}
							</a>
							<span class="badge">{s.status}</span>
						</li>
					{/each}
				</ul>
				<form class="row" onsubmit={addSubtask}>
					<input class="grow" placeholder="Neue Unteraufgabe" bind:value={newSubtask} />
					<button>Hinzufügen</button>
				</form>
			</section>

			<section class="card section">
				<h3>Verknüpfungen</h3>
				{#each groups as g}
					{#if g.items.length}
						<div class="muted small">{g.label}</div>
						<ul class="list">
							{#each g.items as l (l.id)}
								<li class="row">
									<a href="/tickets/{l.ticket.key}" class="grow" class:closed-title={l.ticket.closed}>
										<span class="key">{l.ticket.key}</span>
										{l.ticket.title}
									</a>
									{#if l.ticket.closed}<span class="badge ok">erledigt</span>{/if}
									<button class="ghost" title="Verknüpfung entfernen" onclick={() => run(() => api('DELETE', `${base}/links/${l.id}`))}>✕</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/each}
				<form class="row" onsubmit={addLink}>
					<select bind:value={linkType} style="width: auto">
						<option value="depends_on">setzt voraus</option>
						<option value="blocks">ist Voraussetzung für</option>
						<option value="relates">verknüpft mit</option>
					</select>
					<input class="grow" list="ticket-options" placeholder="Ticket, z.B. {data.project.key}-1" bind:value={linkTarget} />
					<datalist id="ticket-options">
						{#each linkCandidates as o}<option value={o.key}>{o.title}</option>{/each}
					</datalist>
					<button>Verknüpfen</button>
				</form>
			</section>
		</div>

		<aside class="card section stack">
			{#if t.closed}
				<button onclick={() => run(() => api('POST', `${base}/reopen`))}>Wieder öffnen</button>
			{:else}
				<button class="primary" onclick={() => run(() => api('POST', `${base}/close`))}>✓ Abschließen</button>
			{/if}
			<label>
				Status
				<select value={t.columnId} onchange={(e) => patch({ columnId: Number(e.currentTarget.value) })}>
					{#each data.columns as c}<option value={c.id}>{c.name}</option>{/each}
				</select>
			</label>
			<label>
				Priorität
				<select value={t.priority} onchange={(e) => patch({ priority: e.currentTarget.value })}>
					{#each Object.entries(PRIORITY_LABELS) as [v, l]}<option value={v}>{l}</option>{/each}
				</select>
			</label>
			<label>
				Zuständig
				<select value={t.assigneeId ?? ''} onchange={(e) => patch({ assigneeId: e.currentTarget.value || null })}>
					<option value="">Niemand</option>
					{#each data.users as u}<option value={u.id}>{u.name}</option>{/each}
				</select>
			</label>
			<label>
				Start
				<input type="date" value={t.startDate ?? ''} onchange={(e) => patch({ startDate: e.currentTarget.value || null })} />
			</label>
			<label>
				Fällig
				<input type="date" value={t.dueDate ?? ''} onchange={(e) => patch({ dueDate: e.currentTarget.value || null })} />
			</label>
			<label>
				Unteraufgabe von
				<select value={t.parentId ?? ''} onchange={(e) => patch({ parentId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
					<option value="">Keinem Ticket</option>
					{#each parentCandidates as o}<option value={o.id}>{o.key} {o.title}</option>{/each}
				</select>
			</label>
			<div class="muted small">
				Erstellt {new Date(t.createdAt).toLocaleString('de-DE')}<br />
				Geändert {new Date(t.updatedAt).toLocaleString('de-DE')}
			</div>
			<button class="danger" onclick={remove}>Ticket löschen</button>
		</aside>
	</div>
</div>

<style>
	.crumbs {
		margin-bottom: 0.75rem;
	}
	.layout {
		display: grid;
		grid-template-columns: 1fr 260px;
		gap: 1rem;
		align-items: start;
	}
	@media (max-width: 800px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
	.title-input {
		font-size: 1.5rem;
		font-weight: 600;
		border-color: transparent;
		background: transparent;
		padding: 0.2em 0.3em;
	}
	.title-input:hover {
		border-color: var(--border);
	}
	.section {
		padding: 1rem 1.25rem;
	}
	.section h3 {
		margin: 0 0 0.5rem;
	}
	.desc {
		white-space: pre-wrap;
		margin: 0;
	}
	.list {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.list li {
		padding: 0.25rem 0.4rem;
		border-radius: 6px;
	}
	.list li:hover {
		background: var(--surface-2);
	}
	.list a {
		color: var(--text);
	}
	.small {
		font-size: 0.8rem;
		margin-top: 0.5rem;
	}
	.banner {
		padding: 0.6rem 0.9rem;
		border-radius: var(--radius);
		border: 1px solid;
	}
	.banner.ok {
		color: var(--ok);
		background: color-mix(in srgb, var(--ok) 8%, transparent);
	}
	.banner.warn {
		color: var(--warn);
		background: color-mix(in srgb, var(--warn) 8%, transparent);
	}
</style>
