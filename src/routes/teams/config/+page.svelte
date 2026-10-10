<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import { connectTeams, signInWithTeams } from '$lib/teams';
	import * as Card from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import TeamsStatus from '../TeamsStatus.svelte';

	let { data } = $props();

	/** Konfiguration eines Kanal-Tabs: Projekt wählen, Teams speichert daraus die Tab-Adresse */
	let phase = $state<'connecting' | 'signing-in' | 'outside' | 'error' | 'ready'>('connecting');
	let error = $state('');
	let selected = $state('');
	let sdk: Awaited<ReturnType<typeof connectTeams>> = null;

	const project = $derived(data.projects?.find((p) => p.key === selected));

	async function start() {
		phase = 'connecting';
		sdk = await connectTeams();
		if (!sdk) {
			phase = 'outside';
			return;
		}
		if (!data.projects) {
			phase = 'signing-in';
			try {
				await signInWithTeams(sdk);
				await invalidateAll();
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
				phase = 'error';
				return;
			}
		}
		const teams = sdk;
		teams.pages.config.registerOnSaveHandler((save) => {
			const chosen = project;
			if (!chosen) return save.notifyFailure(m.teams_choose_project());
			const origin = page.url.origin;
			const board = `/projects/${chosen.key}/board`;
			teams.pages.config
				.setConfig({
					entityId: `kenny-project-${chosen.key}`,
					contentUrl: `${origin}/teams?to=${encodeURIComponent(board)}`,
					websiteUrl: `${origin}${board}`,
					suggestedDisplayName: `Kenny · ${chosen.name}`
				})
				.then(() => save.notifySuccess())
				.catch((e: unknown) => save.notifyFailure(e instanceof Error ? e.message : String(e)));
		});
		phase = 'ready';
	}

	// „Speichern“ in Teams erst freigeben, wenn ein Projekt gewählt ist
	$effect(() => {
		if (phase === 'ready') sdk?.pages.config.setValidityState(!!project);
	});

	onMount(start);
</script>

<svelte:head><title>{m.teams_title()} · Kenny</title></svelte:head>

<TeamsStatus state={phase} {error} retry={start} />

{#if phase === 'ready'}
	<div class="mx-auto max-w-md p-4">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.teams_config_title()}</Card.Title>
				<Card.Description>{m.teams_config_description()}</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-2">
				{#if data.projects?.length}
					<Label for="teams-project">{m.project()}</Label>
					<Select.Root type="single" bind:value={selected}>
						<Select.Trigger id="teams-project" class="w-full">
							<span class={project ? '' : 'text-muted-foreground'}>{project?.name ?? m.choose_project()}</span>
						</Select.Trigger>
						<Select.Content>
							{#each data.projects as p (p.key)}
								<Select.Item value={p.key} label={p.name}>
									<span class="size-2.5 rounded-full" style="background: {p.color}"></span>
									{p.name}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{:else}
					<p class="text-muted-foreground text-sm">{m.teams_no_projects()}</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{/if}
