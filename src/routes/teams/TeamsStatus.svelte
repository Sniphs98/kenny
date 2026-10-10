<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import KennyLogo from '$lib/components/KennyLogo.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let {
		state,
		error = '',
		retry
	}: {
		state: 'connecting' | 'signing-in' | 'outside' | 'error' | 'ready';
		error?: string;
		retry: () => void;
	} = $props();
</script>

<!-- Zustand der Teams-Anmeldung; bei „ready“ nichts anzeigen -->
{#if state !== 'ready'}
	<div class="grid min-h-screen place-items-center p-4">
		<Card.Root class="w-full max-w-md">
			<Card.Content class="flex flex-col items-center gap-3 text-center">
				<KennyLogo class="size-12" />
				{#if state === 'connecting' || state === 'signing-in'}
					<p class="text-muted-foreground flex items-center gap-2 text-sm" role="status">
						<LoaderCircle class="size-4 animate-spin" />
						{state === 'connecting' ? m.teams_connecting() : m.teams_signing_in()}
					</p>
				{:else if state === 'outside'}
					<h1 class="text-lg font-semibold">{m.teams_outside_title()}</h1>
					<p class="text-muted-foreground text-sm">{m.teams_outside_text()}</p>
					<a href="/" class={buttonVariants()}>{m.teams_open_kenny()}</a>
				{:else}
					<CircleAlert class="text-destructive size-6" />
					<h1 class="text-lg font-semibold">{m.teams_sign_in_failed()}</h1>
					<p class="text-muted-foreground text-sm" role="alert">{m.teams_sign_in_failed_hint()}</p>
					{#if error}<code class="bg-muted rounded px-2 py-1 text-xs break-all">{error}</code>{/if}
					<Button variant="outline" onclick={retry}>{m.teams_retry()}</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{/if}
