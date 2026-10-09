<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
			error =
				res.error.code === 'INVALID_EMAIL_OR_PASSWORD'
					? m.login_invalid()
					: res.error.code === 'USER_ALREADY_EXISTS' || res.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
						? m.register_exists()
						: res.error.code === 'PASSWORD_TOO_SHORT'
							? m.register_password()
							: m.login_failed();
			return;
		}
		await goto(target.startsWith('/') ? target : '/', { invalidateAll: true });
	}

	async function microsoft() {
		await authClient.signIn.social({ provider: 'microsoft', callbackURL: target });
	}
</script>

<div
	class="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_50%_0%,var(--primary-soft),transparent_60%)] p-4"
>
	<div class="w-full max-w-sm">
		<div class="mb-6 text-center">
			<span class="bg-primary text-primary-foreground inline-grid size-11 place-items-center rounded-xl shadow-lg">
				<SquareKanban class="size-5" strokeWidth={2.25} />
			</span>
			<h1 class="mt-4 text-2xl font-semibold tracking-tight">
				{mode === 'login' ? m.welcome_back() : m.create_account()}
			</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				{mode === 'login' ? m.sign_in_to_kenny_to_see_your_projects() : m.create_a_new_kenny_account()}
			</p>
		</div>

		<Card.Root>
			<Card.Content>
				<form class="grid gap-4" onsubmit={submit}>
					{#if mode === 'register'}
						<div class="grid gap-2">
							<Label for="name">{m.name()}</Label>
							<InputGroup.Root>
								<InputGroup.Addon><User /></InputGroup.Addon>
								<InputGroup.Input id="name" bind:value={name} required autocomplete="name" />
							</InputGroup.Root>
						</div>
					{/if}
					<div class="grid gap-2">
						<Label for="email">{m.email()}</Label>
						<InputGroup.Root>
							<InputGroup.Addon><Mail /></InputGroup.Addon>
							<InputGroup.Input id="email" type="email" bind:value={email} required autocomplete="email" />
						</InputGroup.Root>
					</div>
					<div class="grid gap-2">
						<Label for="password">{m.password()}</Label>
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
					<Button type="submit" disabled={busy}>{mode === 'login' ? m.sign_in() : m.sign_up()}</Button>
					{#if data.microsoftEnabled}
						<div
							class="text-muted-foreground flex items-center gap-3 text-xs before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
						>
							{m.or()}
						</div>
						<Button variant="outline" onclick={microsoft}>{m.sign_in_with_microsoft()}</Button>
					{/if}
				</form>
			</Card.Content>
		</Card.Root>

		<p class="text-muted-foreground mt-5 text-center text-sm">
			{#if mode === 'login'}
				{m.don_t_have_an_account()}
				<a class="text-primary font-medium hover:underline" href="#register" onclick={() => (mode = 'register')}
					>{m.sign_up()}</a
				>
			{:else}
				{m.already_registered()}
				<a class="text-primary font-medium hover:underline" href="#login" onclick={() => (mode = 'login')}
					>{m.sign_in()}</a
				>
			{/if}
		</p>
	</div>
</div>
