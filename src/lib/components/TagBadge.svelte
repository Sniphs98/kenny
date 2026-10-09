<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	let {
		name,
		color,
		class: className,
		children
	}: { name: string; color: string; class?: string; children?: Snippet } = $props();
</script>

<!-- Getönt in der Tag-Farbe, Text an Hell/Dunkel angepasst -->
<span
	class={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs font-medium whitespace-nowrap', className)}
	style="--tag: {color}; background: color-mix(in srgb, var(--tag) 14%, transparent); border-color: color-mix(in srgb, var(--tag) 35%, transparent); color: color-mix(in srgb, var(--tag) 70%, var(--foreground))"
>
	<span class="size-1.5 rounded-full" style="background: var(--tag)"></span>
	{name}
	{@render children?.()}
</span>
