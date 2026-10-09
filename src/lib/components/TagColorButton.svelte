<script lang="ts">
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import Hint from '$lib/components/Hint.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/paraglide/messages.js';
	import { Synced } from '$lib/synced.svelte';
	import { untrack } from 'svelte';

	let { name, color, onchange }: { name: string; color: string; onchange: (color: string) => void } = $props();

	let open = $state(false);
	// Während der Auswahl überschreibt ein Live-Update die gewählte Farbe nicht
	const value = new Synced(untrack(() => color));
	$effect(() => value.update(color));

	// Erst beim Schließen speichern, damit Ziehen im Farbwähler nicht bei jedem Schritt eine Anfrage auslöst
	function onOpenChange(next: boolean) {
		if (!next && value.value.toLowerCase() !== color.toLowerCase()) onchange(value.value);
	}
</script>

<Popover.Root bind:open {onOpenChange}>
	<Hint text={m.change_color()}>
		{#snippet children(props)}
			<Popover.Trigger
				{...props}
				class="focus-visible:ring-ring/50 size-9 shrink-0 cursor-pointer rounded-md border outline-none focus-visible:ring-3"
				style="background: {value.value}"
				aria-label={m.color_of({ value1: name })}
			/>
		{/snippet}
	</Hint>
	<Popover.Content class="w-auto max-w-72" align="start">
		<ColorPicker bind:value={value.value} />
	</Popover.Content>
</Popover.Root>
