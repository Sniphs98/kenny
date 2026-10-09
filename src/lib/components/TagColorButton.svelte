<script lang="ts">
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/paraglide/messages.js';

	let { name, color, onchange }: { name: string; color: string; onchange: (color: string) => void } = $props();

	let open = $state(false);
	let value = $state('');
	$effect(() => {
		value = color;
	});

	// Erst beim Schließen speichern, damit Ziehen im Farbwähler nicht bei jedem Schritt eine Anfrage auslöst
	function onOpenChange(next: boolean) {
		if (!next && value.toLowerCase() !== color.toLowerCase()) onchange(value);
	}
</script>

<Popover.Root bind:open {onOpenChange}>
	<Popover.Trigger
		class="focus-visible:ring-ring/50 size-9 shrink-0 cursor-pointer rounded-md border outline-none focus-visible:ring-3"
		style="background: {value}"
		title={m.change_color()}
		aria-label={m.color_of({ value1: name })}
	/>
	<Popover.Content class="w-auto max-w-72" align="start">
		<ColorPicker bind:value />
	</Popover.Content>
</Popover.Root>
