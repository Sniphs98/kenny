<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { safeTarget } from '#lib/safe-target.js';
	import { connectTeams, signInWithTeams } from '#lib/teams.js';
	import TeamsStatus from './TeamsStatus.svelte';

	/** Einstieg der Teams-Tabs: verbinden, per SSO anmelden, dann zur gewünschten Seite (?to=/…) */
	let phase = $state<'connecting' | 'signing-in' | 'outside' | 'error'>('connecting');
	let error = $state('');

	async function start() {
		phase = 'connecting';
		const sdk = await connectTeams();
		if (!sdk) {
			phase = 'outside';
			return;
		}
		phase = 'signing-in';
		try {
			await signInWithTeams(sdk);
			await goto(safeTarget(page.url.searchParams.get('to')), { replace: true, refreshAll: true });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		}
	}

	onMount(start);
</script>

<svelte:head><title>{m.teams_title()} · Kenny</title></svelte:head>

<TeamsStatus state={phase} {error} retry={start} />
