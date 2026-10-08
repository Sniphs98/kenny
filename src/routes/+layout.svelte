<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';

	let { data, children } = $props();

	async function logout() {
		await authClient.signOut();
		await goto('/login', { invalidateAll: true });
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Kenny</title>
</svelte:head>

{#if data.user}
	<header>
		<a class="brand" href="/">Kenny</a>
		<nav>
			<a href="/" class:active={page.url.pathname === '/' || page.url.pathname.startsWith('/projects')}>Projekte</a>
			<a href="/settings/api" class:active={page.url.pathname.startsWith('/settings')}>API</a>
		</nav>
		<span class="grow"></span>
		<span class="muted">{data.user.name}</span>
		<button class="ghost" onclick={logout}>Abmelden</button>
	</header>
{/if}

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.brand {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--text);
	}
	nav {
		display: flex;
		gap: 0.25rem;
	}
	nav a {
		color: var(--muted);
		padding: 0.3em 0.7em;
		border-radius: 6px;
	}
	nav a:hover {
		background: var(--surface-2);
		text-decoration: none;
	}
	nav a.active {
		color: var(--text);
		background: var(--surface-2);
	}
</style>
