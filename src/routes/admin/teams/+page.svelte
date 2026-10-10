<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Hint from '$lib/components/Hint.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';

	let { data } = $props();

	const checks = $derived([
		{ ok: data.status.microsoft, label: m.teams_check_microsoft() },
		{ ok: data.status.https, label: m.teams_check_https() },
		{ ok: data.status.enabled, label: m.teams_check_enabled() }
	]);

	/** Werte für Entra ID → App-Registrierung, in der Reihenfolge der Einrichtung */
	const entra = $derived([
		{ label: m.teams_value_redirect(), value: data.redirectUri },
		{ label: m.teams_value_app_id_uri(), value: data.applicationIdUri },
		{ label: m.teams_value_scope(), value: 'access_as_user' },
		...data.teamsClients.map((c) => ({ label: `${m.teams_value_client()}: ${c.name}`, value: c.id })),
		{ label: m.teams_value_token_version(), value: '"requestedAccessTokenVersion": 2' },
		{ label: m.teams_value_optional_claim(), value: 'email' }
	]);

	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
		toast.success(m.copied());
	}

	let downloading = $state(false);

	/**
	 * Per fetch statt Link: In Teams startet der Browser Downloads aus dem iframe ohne die
	 * (partitionierte) Teams-Sitzung, fetch dagegen sendet sie mit.
	 */
	async function downloadPackage() {
		downloading = true;
		try {
			const response = await fetch('/admin/teams/package');
			if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
			const url = URL.createObjectURL(await response.blob());
			const link = Object.assign(document.createElement('a'), { href: url, download: 'kenny-teams.zip' });
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e));
		} finally {
			downloading = false;
		}
	}
</script>

<svelte:head><title>{m.teams_admin_title()} · Kenny</title></svelte:head>

{#snippet valueRow(label: string, value: string)}
	<div class="grid gap-1 sm:grid-cols-[14rem_1fr_auto] sm:items-center sm:gap-3">
		<span class="text-muted-foreground text-sm">{label}</span>
		<code class="bg-muted truncate rounded px-2 py-1 text-xs" title={value}>{value || '–'}</code>
		<Hint text={m.copy()}>
			{#snippet children(props)}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={`${m.copy()}: ${label}`}
					disabled={!value}
					onclick={() => copy(value)}><Copy /></Button
				>
			{/snippet}
		</Hint>
	</div>
{/snippet}

<div class="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-8">
	<div class="flex items-center gap-3">
		<span class="bg-primary-soft text-primary grid size-10 place-items-center rounded-lg"
			><MessagesSquare class="size-5" /></span
		>
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{m.teams_admin_title()}</h1>
			<p class="text-muted-foreground text-sm">{m.teams_admin_description()}</p>
		</div>
	</div>

	<Card.Root>
		<Card.Header><Card.Title>{m.teams_status()}</Card.Title></Card.Header>
		<Card.Content>
			<ul class="grid gap-2" data-teams-status>
				{#each checks as c (c.label)}
					<li class="flex items-center gap-2 text-sm">
						{#if c.ok}<CircleCheck class="text-success size-4" />{:else}<CircleX class="text-destructive size-4" />{/if}
						<span class="grow">{c.label}</span>
						<Badge variant={c.ok ? 'secondary' : 'outline'}>{c.ok ? m.teams_ok() : m.teams_missing()}</Badge>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.teams_step_entra()}</Card.Title>
			<Card.Description>{m.teams_step_entra_text()}</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3" data-teams-entra>
			{@render valueRow(m.teams_value_client_id(), data.clientId)}
			{@render valueRow(m.teams_value_tenant(), data.tenantId)}
			{#each entra as row (row.label)}{@render valueRow(row.label, row.value)}{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.teams_step_kenny()}</Card.Title>
			<Card.Description>{m.teams_step_kenny_text()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{@render valueRow(m.teams_value_env(), 'TEAMS_ENABLED=true')}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.teams_step_upload()}</Card.Title>
			<Card.Description>{m.teams_step_upload_text()}</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3">
			{@render valueRow(m.teams_value_app_id(), data.appId)}
			{@render valueRow(m.teams_value_version(), data.version)}
			<div>
				<Button disabled={!data.status.enabled || downloading} onclick={downloadPackage}
					><Download /> {m.teams_download_package()}</Button
				>
			</div>
			{#if !data.status.enabled}<p class="text-muted-foreground text-xs">{m.teams_download_disabled()}</p>{/if}
		</Card.Content>
	</Card.Root>
</div>
