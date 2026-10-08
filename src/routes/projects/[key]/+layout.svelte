<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();

	const tabs = [
		{ href: 'board', label: 'Board' },
		{ href: 'gantt', label: 'Gantt' },
		{ href: 'settings', label: 'Einstellungen' }
	];
	const open = $derived(data.tickets.filter((t) => !t.closed).length);
</script>

<svelte:head><title>{data.project.name} · Kenny</title></svelte:head>

<div class="phead" style="--c: {data.project.color}">
	<div class="row">
		<span class="dot"></span>
		<h1>{data.project.name}</h1>
		<span class="key">{data.project.key}</span>
		<span class="badge">{open} offen / {data.tickets.length}</span>
	</div>
	<nav>
		{#each tabs as t}
			<a
				href="/projects/{data.project.key}/{t.href}"
				class:active={page.url.pathname.endsWith('/' + t.href)}>{t.label}</a
			>
		{/each}
	</nav>
</div>

{@render children()}

<style>
	.phead {
		padding: 1rem 1rem 0;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.phead h1 {
		margin: 0;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--c);
	}
	nav {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.75rem;
	}
	nav a {
		padding: 0.5em 0.9em;
		color: var(--muted);
		border-bottom: 2px solid transparent;
	}
	nav a:hover {
		text-decoration: none;
		color: var(--text);
	}
	nav a.active {
		color: var(--text);
		border-bottom-color: var(--c);
	}
</style>
