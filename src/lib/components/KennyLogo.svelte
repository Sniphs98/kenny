<script lang="ts">
	/**
	 * Kenny-Zeichen: drei Board-Spalten im Squircle. Die Farben folgen --primary, in Projekten also
	 * der Projektfarbe, im Dunkelmodus der hellen Variante. Gleiche Form wie favicon.svg und das Teams-Icon.
	 */
	let { class: className = '', label }: { class?: string; label?: string } = $props();
</script>

<svg
	viewBox="0 0 100 100"
	xmlns="http://www.w3.org/2000/svg"
	class={className}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<path d="M50 0C88 0 100 12 100 50S88 100 50 100 0 88 0 50 12 0 50 0Z" class="fill-primary" />
	<g class="fill-primary-foreground">
		<rect x="22" y="24" width="15" height="46" rx="5" />
		<rect x="42.5" y="24" width="15" height="30" rx="5" />
		<rect x="63" y="24" width="15" height="54" rx="5" />
	</g>
</svg>
