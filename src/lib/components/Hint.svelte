<script lang="ts" module>
	/** Tooltip-Handler aus den Trigger-Props und eigenen Handler nacheinander ausführen */
	export function chain<E extends Event>(tooltipHandler: unknown, own: (event: E) => void) {
		return (event: E) => {
			if (typeof tooltipHandler === 'function') tooltipHandler(event);
			own(event);
		};
	}
</script>

<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { Snippet } from 'svelte';

	// Tooltip-Hülle statt title-Attribut. Das Element bekommt die Trigger-Props über das Snippet:
	//   <Hint text="Löschen">{#snippet children(props)}<Button {...props} onclick={…}>…</Button>{/snippet}</Hint>
	// Eigene Handler nach {...props} angeben, damit sie Vorrang haben.
	let {
		text,
		side = 'top',
		children
	}: {
		/** Ohne Text wird nur das Element gerendert */
		text: string | null | undefined;
		side?: 'top' | 'right' | 'bottom' | 'left';
		children: Snippet<[Record<string, unknown>]>;
	} = $props();
</script>

{#if text}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render children(props)}
			{/snippet}
		</Tooltip.Trigger>
		<!-- Esc gehört dem umgebenden Dialog/Modal; ohne solches schließt Esc nur den Tooltip -->
		<Tooltip.Content {side} class="pointer-events-none" escapeKeydownBehavior="defer-otherwise-close"
			>{text}</Tooltip.Content
		>
	</Tooltip.Root>
{:else}
	{@render children({})}
{/if}
