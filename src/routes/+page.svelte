<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';

	let { data } = $props();

	let dialog: HTMLDialogElement;
	let name = $state('');
	let key = $state('');
	let description = $state('');
	let color = $state('#6366f1');
	let error = $state('');

	async function create(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		try {
			const p = await api<{ key: string }>('POST', '/projects', {
				name,
				key: key || undefined,
				description,
				color
			});
			dialog.close();
			await goto(`/projects/${p.key}/board`, { invalidateAll: true });
		} catch (err) {
			error = (err as Error).message;
		}
	}
</script>

<div class="page">
	<div class="row head">
		<h1 class="grow">Projekte</h1>
		<button class="primary" onclick={() => dialog.showModal()}>+ Neues Projekt</button>
	</div>

	{#if data.projects.length === 0}
		<div class="card empty">
			<p>Noch keine Projekte vorhanden.</p>
			<button class="primary" onclick={() => dialog.showModal()}>Erstes Projekt anlegen</button>
		</div>
	{:else}
		<div class="grid">
			{#each data.projects as p (p.id)}
				<a class="card project" href="/projects/{p.key}/board" style="--c: {p.color}">
					<div class="row">
						<span class="dot"></span>
						<strong class="grow">{p.name}</strong>
						<span class="key">{p.key}</span>
					</div>
					{#if p.description}<p class="muted desc">{p.description}</p>{/if}
					<div class="row stats">
						<span class="badge">{p.open} offen</span>
						<span class="badge ok">{p.total - p.open} erledigt</span>
					</div>
					{#if p.total > 0}
						<div class="bar"><div style="width: {((p.total - p.open) / p.total) * 100}%"></div></div>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

<dialog bind:this={dialog}>
	<form class="stack" onsubmit={create}>
		<h2>Neues Projekt</h2>
		<div class="row">
			<label class="grow">Name <input bind:value={name} required maxlength="120" /></label>
			<label style="width: 8em">Kürzel <input bind:value={key} placeholder="auto" maxlength="10" /></label>
			<label>Farbe <input type="color" bind:value={color} /></label>
		</div>
		<label>Beschreibung <textarea bind:value={description} rows="3"></textarea></label>
		{#if error}<p class="error">{error}</p>{/if}
		<div class="row" style="justify-content: flex-end">
			<button type="button" onclick={() => dialog.close()}>Abbrechen</button>
			<button class="primary">Anlegen</button>
		</div>
	</form>
</dialog>

<style>
	.head {
		margin-bottom: 1rem;
	}
	.head h1 {
		margin: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1rem;
	}
	.project {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1rem;
		color: var(--text);
		border-top: 3px solid var(--c);
	}
	.project:hover {
		text-decoration: none;
		border-color: var(--c);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.desc {
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.bar {
		height: 4px;
		background: var(--surface-2);
		border-radius: 2px;
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		background: var(--ok);
	}
	.empty {
		padding: 2rem;
		text-align: center;
	}
</style>
