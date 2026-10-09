<script lang="ts">
	import { localizeError } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { projectFormSchema } from '$lib/contracts';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import LiveUpdates from '$lib/components/LiveUpdates.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	let open = $state(false);
	const { form, errors, message, enhance, reset, submitting } = superForm(
		untrack(() => data.form),
		{
			validationMethod: 'onsubmit',
			validators: zod4Client(projectFormSchema)
		}
	);

	function openDialog() {
		reset();
		open = true;
	}
</script>

<LiveUpdates />

<div class="mx-auto max-w-6xl px-5 py-8">
	<div class="mb-6 flex items-end gap-4">
		<div class="grow">
			<h1 class="text-2xl font-semibold tracking-tight">{m.projects()}</h1>
			<p class="text-muted-foreground mt-1 text-sm">{m.all_projects_and_their_current_progress()}</p>
		</div>
		<Button onclick={openDialog}><Plus /> {m.new_project()}</Button>
	</div>

	{#if data.projects.length === 0}
		<Card.Root class="items-center px-6 py-12 text-center">
			<span class="bg-primary-soft text-primary grid size-12 place-items-center rounded-xl">
				<FolderKanban class="size-6" />
			</span>
			<div>
				<h2 class="text-lg font-semibold">{m.no_projects_yet()}</h2>
				<p class="text-muted-foreground text-sm">{m.create_your_first_project_to_start_tracking_tickets()}</p>
			</div>
			<Button onclick={openDialog}><Plus /> {m.create_project()}</Button>
		</Card.Root>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
			{#each data.projects as p (p.id)}
				{@const done = p.total - p.open}
				<a href="/projects/{p.key}/board" class="group" style="--c: {p.color}">
					<Card.Root class="hover:border-foreground/25 h-full gap-4 py-5 transition-colors">
						<Card.Header class="flex items-center gap-3 px-5">
							<span
								class="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold"
								style="background: color-mix(in srgb, var(--c) 15%, transparent); color: var(--c)"
							>
								{p.key.slice(0, 2)}
							</span>
							<div class="min-w-0 grow">
								<Card.Title class="truncate">{p.name}</Card.Title>
								<div class="text-muted-foreground font-mono text-xs">{p.key}</div>
							</div>
							<ChevronRight class="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
						</Card.Header>
						{#if p.description}
							<Card.Content class="px-5">
								<p class="text-muted-foreground line-clamp-2">{p.description}</p>
							</Card.Content>
						{/if}
						<Card.Footer class="mt-auto flex-col items-stretch gap-1.5 px-5">
							<div class="text-muted-foreground flex text-xs">
								<span class="grow">{m.open_done({ value1: p.open, value2: done })}</span>
								{#if p.total > 0}<span>{Math.round((done / p.total) * 100)}%</span>{/if}
							</div>
							<div class="bg-muted h-1 overflow-hidden rounded-full">
								<div
									class="h-full rounded-full"
									style="width: {p.total ? (done / p.total) * 100 : 0}%; background: var(--c)"
								></div>
							</div>
						</Card.Footer>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" method="POST" use:enhance>
			<Dialog.Header>
				<Dialog.Title>{m.new_project()}</Dialog.Title>
				<Dialog.Description>{m.tickets_use_the_project_key_as_a_prefix_e_g_web_1()}</Dialog.Description>
			</Dialog.Header>
			<div class="flex gap-3">
				<div class="grid grow gap-2">
					<Label for="p-name">{m.name()}</Label>
					<Input name="name" id="p-name" bind:value={$form.name} required maxlength={120} />
				</div>
				<div class="grid w-28 gap-2">
					<Label for="p-key">{m.key()}</Label>
					<Input name="key" id="p-key" bind:value={$form.key} placeholder={m.auto()} maxlength={10} />
				</div>
			</div>
			<div class="grid gap-2">
				<Label>{m.color()}</Label>
				<ColorPicker bind:value={$form.color} />
				<input type="hidden" name="color" value={$form.color} />
			</div>
			<div class="grid gap-2">
				<Label for="p-desc">{m.description()}</Label>
				<Textarea name="description" id="p-desc" bind:value={$form.description} rows={3} />
			</div>
			{#each Object.values($errors)
				.flat()
				.filter((value): value is string => typeof value === 'string') as error, i (i)}<p
					class="text-destructive text-sm"
					role="alert"
				>
					{localizeError(error)}
				</p>{/each}
			{#if $message}<p class="text-destructive text-sm" role="alert">{localizeError($message)}</p>{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>{m.cancel()}</Button>
				<Button type="submit" disabled={$submitting}>{m.create()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
