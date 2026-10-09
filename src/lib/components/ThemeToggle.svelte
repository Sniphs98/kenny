<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	const options = [
		{ value: 'system', label: m.system(), icon: Monitor },
		{ value: 'light', label: m.light(), icon: Sun },
		{ value: 'dark', label: m.dark(), icon: Moon }
	] as const;
</script>

<ToggleGroup.Root
	type="single"
	size="sm"
	variant="outline"
	value={userPrefersMode.current}
	onValueChange={(v) => v && setMode(v as 'system' | 'light' | 'dark')}
	aria-label={m.appearance()}
>
	{#each options as o (o.value)}
		<ToggleGroup.Item value={o.value} aria-label={o.label} title={o.label}>
			<o.icon />
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
