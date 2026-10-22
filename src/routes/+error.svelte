<script lang="ts">
	import { withBase } from '#lib/paths.js';
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>404 · Kenny</title>
</svelte:head>

<div class="grid min-h-screen place-items-center p-4 text-center">
	<div>
		<img src={withBase('/kenny.webp')} alt="" class="mx-auto mb-6 max-h-64 rounded-lg object-contain" />
		<p class="text-muted-foreground text-sm font-medium tracking-[0.3em]">404</p>
		<h1 class="mt-3 text-3xl font-semibold tracking-tight">{m.you_killed_kenny()}</h1>
	</div>
</div>
