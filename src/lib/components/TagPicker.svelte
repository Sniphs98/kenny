<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Plus from '@lucide/svelte/icons/plus';
	import TagIcon from '@lucide/svelte/icons/tag';

	type Tag = { id: number; name: string; color: string };
	/** Tag-ID oder Name eines noch anzulegenden Tags */
	type Ref = number | string;

	let {
		tags,
		value,
		onchange,
		disabled = false,
		class: className
	}: {
		/** Alle Tags des Projekts */
		tags: Tag[];
		value: Ref[];
		onchange: (refs: Ref[]) => void;
		disabled?: boolean;
		class?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');

	const byId = $derived(new Map(tags.map((t) => [t.id, t])));
	const selected = $derived(
		value.map((r) => (typeof r === 'number' ? byId.get(r) : null) ?? { id: r, name: String(r), color: '#71717a' })
	);
	const canCreate = $derived(
		query.trim() !== '' &&
			!tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase()) &&
			!value.some((r) => typeof r === 'string' && r.toLowerCase() === query.trim().toLowerCase())
	);

	function toggle(ref: Ref) {
		onchange(value.includes(ref) ? value.filter((r) => r !== ref) : [...value, ref]);
	}

	function create() {
		const name = query.trim();
		query = '';
		onchange([...value, name]);
	}
</script>

<Popover.Root bind:open onOpenChange={(o) => !o && (query = '')}>
	<Popover.Trigger
		{disabled}
		class={cn(
			buttonVariants({
				variant: 'outline',
				class: 'h-auto min-h-9 w-full flex-wrap justify-start gap-1 py-1.5 font-normal'
			}),
			className
		)}
		onclick={(e) => e.stopPropagation()}
	>
		{#each selected as t (t.id)}
			<TagBadge name={t.name} color={t.color} />
		{:else}
			<TagIcon class="text-muted-foreground" />
			<span class="text-muted-foreground">{m.no_tags()}</span>
		{/each}
	</Popover.Trigger>
	<Popover.Content class="w-64 p-0" align="start" onclick={(e) => e.stopPropagation()}>
		<Command.Root>
			<Command.Input placeholder={m.search_or_create_a_tag()} bind:value={query} />
			<Command.List>
				{#if !canCreate}<Command.Empty>{m.no_tags_found()}</Command.Empty>{/if}
				<Command.Group>
					{#each tags as t (t.id)}
						<Command.Item
							value={String(t.id)}
							keywords={[t.name]}
							data-checked={value.includes(t.id)}
							onSelect={() => toggle(t.id)}
						>
							<TagBadge name={t.name} color={t.color} />
						</Command.Item>
					{/each}
					{#each value.filter((r) => typeof r === 'string') as name (name)}
						<Command.Item value="new:{name}" keywords={[name]} data-checked onSelect={() => toggle(name)}>
							<TagBadge {name} color="#71717a" />
							<span class="text-muted-foreground text-xs">{m.new()}</span>
						</Command.Item>
					{/each}
				</Command.Group>
				<!-- Außerhalb der Gruppe: eine Gruppe ohne Treffer wird komplett ausgeblendet -->
				{#if canCreate}
					<Command.Item value="__create" keywords={[query]} forceMount onSelect={create}>
						<Plus />
						<span class="truncate">{m.create_2({ value1: query.trim() })}</span>
					</Command.Item>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
