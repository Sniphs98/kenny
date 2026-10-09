<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { clientId, LIVE_EVENT } from '$lib/live-client';

	// Live-Updates per Server-Sent Events: Änderungen anderer (Tabs, Personen, API) laden die
	// Seite im Hintergrund neu. refreshAll() behält den Zustand, z. B. ein offenes Ticket-Modal.
	let {
		project,
		onDeleted
	}: {
		/** Nur Änderungen dieses Projekts; ohne Angabe alle Projekte (Übersicht) */
		project?: string;
		/** Das Projekt wurde von jemand anderem gelöscht */
		onDeleted?: () => void;
	} = $props();

	/** Mehrere Meldungen kurz hintereinander führen zu einem einzigen Neuladen */
	const DEBOUNCE_MS = 250;

	$effect(() => {
		const url = `/api/v1/events${project ? `?project=${encodeURIComponent(project)}` : ''}`;
		const source = new EventSource(url);
		let timer: ReturnType<typeof setTimeout> | undefined;
		let opened = false;

		const reload = () => {
			clearTimeout(timer);
			timer = setTimeout(async () => {
				await refreshAll();
				window.dispatchEvent(new CustomEvent(LIVE_EVENT));
			}, DEBOUNCE_MS);
		};

		source.addEventListener('change', (e) => {
			const event = JSON.parse((e as MessageEvent<string>).data) as { origin?: string; kind?: string };
			if (event.origin === clientId) return;
			if (event.kind === 'deleted' && onDeleted) onDeleted();
			else reload();
		});
		// Nach einem Verbindungsabbruch könnten Meldungen fehlen: beim Wiederverbinden einmal neu laden
		source.addEventListener('open', () => {
			if (opened) reload();
			opened = true;
		});

		return () => {
			clearTimeout(timer);
			source.close();
		};
	});
</script>
