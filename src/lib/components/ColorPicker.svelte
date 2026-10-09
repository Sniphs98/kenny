<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Hint from '$lib/components/Hint.svelte';
	import { cn } from '$lib/utils';
	import Check from '@lucide/svelte/icons/check';
	import Pipette from '@lucide/svelte/icons/pipette';

	let { value = $bindable() }: { value: string } = $props();

	const presets = [
		'#292524',
		'#6366f1',
		'#3b82f6',
		'#0ea5e9',
		'#14b8a6',
		'#22c55e',
		'#eab308',
		'#f97316',
		'#ef4444',
		'#ec4899',
		'#a855f7'
	];
	const isPreset = $derived(presets.includes(value.toLowerCase()));
</script>

<div class="flex flex-wrap items-center gap-2">
	{#each presets as c (c)}
		<Hint text={c}>
			{#snippet children(props)}
				<button
					{...props}
					type="button"
					class="focus-visible:ring-ring/50 grid size-7 place-items-center rounded-full text-white outline-none focus-visible:ring-3"
					style="background: {c}"
					aria-label={m.color_2({ value1: c })}
					onclick={() => (value = c)}
				>
					{#if value.toLowerCase() === c}<Check class="size-4" />{/if}
				</button>
			{/snippet}
		</Hint>
	{/each}
	<Hint text={m.custom_color()}>
		{#snippet children(props)}
			<label
				{...props}
				class={cn(
					'text-muted-foreground hover:text-foreground relative grid size-7 cursor-pointer place-items-center rounded-full border border-dashed',
					!isPreset && 'border-solid text-white'
				)}
				style={isPreset ? '' : `background: ${value}`}
			>
				<Pipette class="size-3.5" />
				<input
					type="color"
					bind:value
					class="absolute inset-0 cursor-pointer opacity-0"
					aria-label={m.custom_color()}
				/>
			</label>
		{/snippet}
	</Hint>
</div>
