<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { initials } from '$lib/api';
	import { cn } from '$lib/utils';
	import UserRound from '@lucide/svelte/icons/user-round';

	let {
		name,
		size = 'default',
		class: className
	}: { name: string | null | undefined; size?: 'sm' | 'default' | 'lg'; class?: string } = $props();
</script>

<Avatar.Root {size} class={className} title={name ?? 'Niemand'}>
	<Avatar.Fallback
		class={cn(name ? 'bg-primary-soft text-primary font-semibold' : 'border border-dashed bg-transparent')}
	>
		{#if name}{initials(name)}{:else}<UserRound class="size-3.5" />{/if}
	</Avatar.Fallback>
</Avatar.Root>
