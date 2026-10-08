<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Label } from '$lib/components/ui/label';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Lock from '@lucide/svelte/icons/lock';
	import Mail from '@lucide/svelte/icons/mail';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import User from '@lucide/svelte/icons/user';

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

<div class="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_50%_0%,var(--primary-soft),transparent_60%)] p-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 text-center">
			<span class="bg-primary text-primary-foreground inline-grid size-11 place-items-center rounded-xl shadow-lg">
				<SquareKanban class="size-5" strokeWidth={2.25} />
			</span>
			<h1 class="mt-4 text-2xl font-semibold tracking-tight">{mode === 'login' ? 'Willkommen zurück' : 'Konto erstellen'}</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				{mode === 'login' ? 'Melde dich bei Kenny an, um deine Projekte zu sehen.' : 'Lege ein neues Konto für Kenny an.'}
			</p>
		</div>

		<Card.Root>
			<Card.Content>
				<form class="grid gap-4" onsubmit={submit}>
					{#if mode === 'register'}
						<div class="grid gap-2">
							<Label for="name">Name</Label>
							<InputGroup.Root>
								<InputGroup.Addon><User /></InputGroup.Addon>
								<InputGroup.Input id="name" bind:value={name} required autocomplete="name" />
							</InputGroup.Root>
						</div>
					{/if}
					<div class="grid gap-2">
						<Label for="email">E-Mail</Label>
						<InputGroup.Root>
							<InputGroup.Addon><Mail /></InputGroup.Addon>
							<InputGroup.Input id="email" type="email" bind:value={email} required autocomplete="email" />
						</InputGroup.Root>
					</div>
					<div class="grid gap-2">
						<Label for="password">Passwort</Label>
						<InputGroup.Root>
							<InputGroup.Addon><Lock /></InputGroup.Addon>
							<InputGroup.Input
								id="password"
								type="password"
								bind:value={password}
								required
								minlength={8}
								autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
							/>
						</InputGroup.Root>
					</div>
					{#if error}
						<Alert.Root variant="destructive">
							<CircleAlert />
							<Alert.Title>{error}</Alert.Title>
						</Alert.Root>
					{/if}
					<Button type="submit" disabled={busy}>{mode === 'login' ? 'Anmelden' : 'Registrieren'}</Button>
					{#if data.microsoftEnabled}
						<div class="text-muted-foreground flex items-center gap-3 text-xs before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
							oder
						</div>
						<Button variant="outline" onclick={microsoft}>Mit Microsoft anmelden</Button>
					{/if}
				</form>
			</Card.Content>
		</Card.Root>

		<p class="text-muted-foreground mt-5 text-center text-sm">
			{#if mode === 'login'}
				Noch kein Konto? <a class="text-primary font-medium hover:underline" href="#register" onclick={() => (mode = 'register')}>Registrieren</a>
			{:else}
				Schon registriert? <a class="text-primary font-medium hover:underline" href="#login" onclick={() => (mode = 'login')}>Anmelden</a>
			{/if}
		</p>
	</div>
</div>
