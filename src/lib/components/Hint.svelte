<script lang="ts" module>
	/** Tooltip-Handler aus den Trigger-Props und eigenen Handler nacheinander ausführen */
	export function chain<E extends Event>(tooltipHandler: unknown, own: (event: E) => void) {
		return (event: E) => {
			if (typeof tooltipHandler === 'function') tooltipHandler(event);
			own(event);
		};
	}

	/**
	 * Anker am Mauszeiger für breite Flächen (z.B. Gantt-Zeilen), damit der Tooltip nicht mittig
	 * über der ganzen Fläche, sondern am Zeiger erscheint. track() im onmousemove aufrufen.
	 */
	export function cursorAnchor() {
		// Nur Zahlen merken: DOMRect gibt es beim Server-Rendering nicht
		let point = { x: 0, y: 0, height: 0 };
		return {
			anchor: { getBoundingClientRect: () => new DOMRect(point.x, point.y, 0, point.height) },
			track(event: MouseEvent) {
				const area = (event.currentTarget as HTMLElement).getBoundingClientRect();
				point = { x: event.clientX, y: area.top, height: area.height };
			}
		};
	}
</script>

<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { Snippet } from 'svelte';

	// Tooltip-Hülle statt title-Attribut. Das Element bekommt die Trigger-Props über das Snippet:
	//   <Hint text="Löschen">{#snippet children(props)}<Button {...props} onclick={…}>…</Button>{/snippet}</Hint>
	// Eigene Handler nach {...props} angeben, damit sie Vorrang haben (oder mit chain() verbinden).
	let {
		text,
		side = 'top',
		disabled = false,
		anchor,
		children
	}: {
		/** Ohne Text wird nur das Element gerendert */
		text: string | null | undefined;
		side?: 'top' | 'right' | 'bottom' | 'left';
		/** Z.B. während des Ziehens: schließt einen offenen Tooltip und öffnet keinen neuen */
		disabled?: boolean;
		/** Abweichender Bezugspunkt, siehe cursorAnchor() */
		anchor?: { getBoundingClientRect: () => DOMRect };
		children: Snippet<[Record<string, unknown>]>;
	} = $props();

	let open = $state(false);
	$effect(() => {
		if (disabled) open = false;
	});
</script>

{#if text}
	<Tooltip.Root bind:open {disabled}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render children(props)}
			{/snippet}
		</Tooltip.Trigger>
		<!-- Esc gehört dem umgebenden Dialog/Modal; ohne solches schließt Esc nur den Tooltip -->
		<Tooltip.Content
			{side}
			customAnchor={anchor}
			class="pointer-events-none"
			escapeKeydownBehavior="defer-otherwise-close">{text}</Tooltip.Content
		>
	</Tooltip.Root>
{:else}
	{@render children({})}
{/if}
