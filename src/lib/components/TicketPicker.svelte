<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { buttonVariants } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';

	type Option = { id: number; key: string; title: string };

	let {
		tickets,
		value = $bindable(''),
		placeholder = m.choose_ticket(),
		class: className
	}: {
		tickets: Option[];
		/** Schlüssel des gewählten Tickets, z.B. "WEB-3" */
		value?: string;
		placeholder?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	const current = $derived(tickets.find((o) => o.key === value) ?? null);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class={cn(buttonVariants({ variant: 'outline' }), 'min-w-0 justify-between px-2.5 font-normal', className)}
		aria-label={m.choose_ticket()}
	>
		{#if current}
			<span class="flex min-w-0 items-center gap-2">
				<span class="text-muted-foreground font-mono text-xs">{current.key}</span>
				<span class="truncate">{current.title}</span>
			</span>
		{:else}
			<span class="text-muted-foreground truncate">{placeholder}</span>
		{/if}
		<ChevronsUpDown class="text-muted-foreground" />
	</Popover.Trigger>
	<Popover.Content class="w-80 p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={m.search_ticket_number_or_title()} />
			<Command.List class="max-h-72">
				<Command.Empty>{m.no_ticket_found()}</Command.Empty>
				<Command.Group>
					{#each tickets as o (o.id)}
						<Command.Item
							value={o.key}
							keywords={[o.title]}
							onSelect={() => {
								value = o.key;
								open = false;
							}}
						>
							<span class="text-muted-foreground w-16 shrink-0 font-mono text-xs">{o.key}</span>
							<span class="grow truncate">{o.title}</span>
							{#if o.key === value}<Check />{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
