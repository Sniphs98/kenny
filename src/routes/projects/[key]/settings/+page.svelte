<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api } from '$lib/api';

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
	let error = $state('');
	let saved = $state(false);

	const base = $derived(`/projects/${data.project.key}`);

	async function run(fn: () => Promise<unknown>) {
		error = '';
		try {
			await fn();
			await invalidateAll();
		} catch (err) {
			error = (err as Error).message;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		await run(() => api('PATCH', base, { name, description, color }));
		saved = true;
		setTimeout(() => (saved = false), 1500);
	}

	async function addColumn(e: SubmitEvent) {
		e.preventDefault();
		if (!newColumn.trim()) return;
		await run(() => api('POST', `${base}/columns`, { name: newColumn }));
		newColumn = '';
	}

	async function remove() {
		if (!confirm(`Projekt "${data.project.name}" mit allen Tickets endgültig löschen?`)) return;
		await api('DELETE', base);
		await goto('/', { invalidateAll: true });
	}
</script>

<div class="page stack">
	{#if error}<p class="error">{error}</p>{/if}

	<form class="card section stack" onsubmit={save}>
		<h2>Projekt</h2>
		<div class="row">
			<label class="grow">Name <input bind:value={name} required /></label>
			<label>Farbe <input type="color" bind:value={color} /></label>
		</div>
		<label>Beschreibung <textarea bind:value={description} rows="3"></textarea></label>
		<div class="row">
			<button class="primary">Speichern</button>
			{#if saved}<span class="muted">Gespeichert ✓</span>{/if}
		</div>
	</form>

	<section class="card section stack">
		<h2>Board-Spalten</h2>
		<p class="muted">
			Tickets in Spalten mit „Erledigt“ gelten als abgeschlossen. Beim Schließen per API landet ein
			Ticket in der ersten Erledigt-Spalte.
		</p>
		<ul class="cols">
			{#each data.columns as col, i (col.id)}
				<li class="row">
					<input
						class="grow"
						value={col.name}
						onchange={(e) => run(() => api('PATCH', `${base}/columns/${col.id}`, { name: e.currentTarget.value }))}
					/>
					<label class="inline">
						<input
							type="checkbox"
							checked={col.isDone}
							onchange={(e) => run(() => api('PATCH', `${base}/columns/${col.id}`, { isDone: e.currentTarget.checked }))}
						/> Erledigt
					</label>
					<button
						class="ghost"
						title="Nach oben"
						disabled={i === 0}
						onclick={() => run(() => api('PATCH', `${base}/columns/${col.id}`, { position: i - 1 }))}>↑</button
					>
					<button
						class="ghost"
						title="Nach unten"
						disabled={i === data.columns.length - 1}
						onclick={() => run(() => api('PATCH', `${base}/columns/${col.id}`, { position: i + 1 }))}>↓</button
					>
					<button class="ghost danger" onclick={() => run(() => api('DELETE', `${base}/columns/${col.id}`))}>Löschen</button>
				</li>
			{/each}
		</ul>
		<form class="row" onsubmit={addColumn}>
			<input class="grow" placeholder="Neue Spalte" bind:value={newColumn} />
			<button>Hinzufügen</button>
		</form>
	</section>

	<section class="card section stack">
		<h2>Gefahrenzone</h2>
		<div><button class="danger" onclick={remove}>Projekt löschen</button></div>
	</section>
</div>

<style>
	.section {
		padding: 1.25rem;
	}
	.section h2 {
		margin: 0;
	}
	.cols {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
</style>
