<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client.js';
	import { withBase } from '#lib/paths.js';
	import { m } from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';

	let { data } = $props();
	let busy = $state(false);
	let failed = $state(false);
	const callbackError = $derived(page.url.searchParams.has('error'));

	async function connectMicrosoft() {
		busy = true;
		failed = false;
		try {
			const result = await authClient.linkSocial({
				provider: 'microsoft',
				callbackURL: withBase('/settings/account'),
				errorCallbackURL: withBase('/settings/account'),
				additionalParams: { prompt: 'select_account' }
			});
			if (result.error) {
				failed = true;
				busy = false;
			}
		} catch {
			failed = true;
			busy = false;
		}
	}
</script>

<svelte:head><title>{m.account_settings()} · Kenny</title></svelte:head>

<div class="mx-auto grid max-w-2xl gap-5 px-5 py-8">
	<h1 class="text-2xl font-semibold tracking-tight">{m.account_settings()}</h1>
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.microsoft_account()}</Card.Title>
			<Card.Description>{m.microsoft_link_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			{#if callbackError || failed}<p class="text-destructive text-sm" role="alert">{m.microsoft_link_failed()}</p>{/if}
			{#if data.connections.microsoftLinked}
				<p role="status">{m.microsoft_account_connected()}</p>
				<p class="text-muted-foreground text-sm">
					{data.connections.microsoftEnabled ? m.microsoft_signin_ready() : m.microsoft_not_configured()}
				</p>
			{:else if !data.connections.microsoftEnabled}
				<p class="text-muted-foreground text-sm">{m.microsoft_not_configured()}</p>
			{:else if !data.connections.microsoftLinkingEnabled}
				<p class="text-muted-foreground text-sm">{m.microsoft_fixed_tenant_required()}</p>
			{:else}
				<p class="text-muted-foreground text-sm">{m.microsoft_link_account_choice()}</p>
				<Button class="justify-self-start" disabled={busy} onclick={connectMicrosoft}
					>{m.connect_microsoft_account()}</Button
				>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
