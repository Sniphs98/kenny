<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Hint from '$lib/components/Hint.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { initials } from '$lib/api';
	import { cn } from '$lib/utils';
	import UserRound from '@lucide/svelte/icons/user-round';

	let {
		name,
		size = 'default',
		tooltip = true,
		class: className
	}: {
		name: string | null | undefined;
		size?: 'sm' | 'default' | 'lg';
		/** Namen als Tooltip zeigen; aus, wenn das Umfeld schon einen eigenen Tooltip hat */
		tooltip?: boolean;
		class?: string;
	} = $props();
</script>

<Hint text={tooltip ? (name ?? m.nobody()) : null}>
	{#snippet children(props)}
		<Avatar.Root {...props} {size} class={className}>
			<Avatar.Fallback
				class={cn(name ? 'bg-primary-soft text-primary font-semibold' : 'border border-dashed bg-transparent')}
			>
				{#if name}{initials(name)}{:else}<UserRound class="size-3.5" />{/if}
			</Avatar.Fallback>
		</Avatar.Root>
	{/snippet}
</Hint>
