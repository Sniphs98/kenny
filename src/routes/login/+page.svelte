<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';

	let { data } = $props();

	let mode = $state<'login' | 'register'>('login');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	const target = $derived(page.url.searchParams.get('redirect') || '/');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		busy = true;
		const res =
			mode === 'login'
				? await authClient.signIn.email({ email, password })
				: await authClient.signUp.email({ name, email, password });
		busy = false;
		if (res.error) {
			error = res.error.message ?? 'Anmeldung fehlgeschlagen';
			return;
		}
		await goto(target.startsWith('/') ? target : '/', { invalidateAll: true });
	}

	async function microsoft() {
		await authClient.signIn.social({ provider: 'microsoft', callbackURL: target });
	}
</script>

<div class="wrap">
	<form class="card stack" onsubmit={submit}>
		<h1>Kenny</h1>
		<p class="muted">{mode === 'login' ? 'Melde dich an, um deine Projekte zu sehen.' : 'Neues Konto anlegen.'}</p>
		{#if mode === 'register'}
			<label>Name <input bind:value={name} required autocomplete="name" /></label>
		{/if}
		<label>E-Mail <input type="email" bind:value={email} required autocomplete="email" /></label>
		<label>
			Passwort
			<input
				type="password"
				bind:value={password}
				required
				minlength="8"
				autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
			/>
		</label>
		{#if error}<p class="error">{error}</p>{/if}
		<button class="primary" disabled={busy}>{mode === 'login' ? 'Anmelden' : 'Registrieren'}</button>
		{#if data.microsoftEnabled}
			<button type="button" onclick={microsoft}>Mit Microsoft anmelden</button>
		{/if}
		<p class="muted switch">
			{#if mode === 'login'}
				Noch kein Konto? <a href="#register" onclick={() => (mode = 'register')}>Registrieren</a>
			{:else}
				Schon registriert? <a href="#login" onclick={() => (mode = 'login')}>Anmelden</a>
			{/if}
		</p>
	</form>
</div>

<style>
	.wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 1rem;
	}
	form {
		width: min(380px, 100%);
		padding: 1.75rem;
	}
	.switch {
		text-align: center;
		margin: 0;
	}
</style>
