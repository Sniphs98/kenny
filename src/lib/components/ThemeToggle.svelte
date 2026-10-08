<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	const options = [
		{ value: 'system', label: 'System', icon: Monitor },
		{ value: 'light', label: 'Hell', icon: Sun },
		{ value: 'dark', label: 'Dunkel', icon: Moon }
	] as const;
</script>

<ToggleGroup.Root
	type="single"
	size="sm"
	variant="outline"
	value={userPrefersMode.current}
	onValueChange={(v) => v && setMode(v as 'system' | 'light' | 'dark')}
	aria-label="Darstellung"
>
	{#each options as o (o.value)}
		<ToggleGroup.Item value={o.value} aria-label={o.label} title={o.label}>
			<o.icon />
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
