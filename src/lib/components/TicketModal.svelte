<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { goto, invalidateAll, preloadData, refreshAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import TicketView from '$lib/components/TicketView.svelte';
	import Hint from '$lib/components/Hint.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { LIVE_EVENT } from '$lib/live-client';
	import { openTicket } from '$lib/ticket-modal';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';

	const data = $derived(page.state.ticket);

	function close() {
		history.back();
	}

	/** Nach Änderungen: Hintergrund und Ticket neu laden, ohne das Modal zu schließen */
	async function refresh() {
		// Beim Shallow Routing zeigt page.url weiter auf den Hintergrund (Board/Gantt),
		// daher die Ticket-URL selbst bilden
		if (!data) return;
		const href = `/tickets/${data.ticket.key}`;
		await refreshAll();
		const result = await preloadData(href);
		if (result.type === 'loaded' && result.status === 200) {
			replaceState('', { ticket: result.data as App.PageState['ticket'] });
		}
	}

	/** Nur das Ticket im Modal neu laden; ist es inzwischen gelöscht, Modal schließen */
	async function reloadTicket() {
		if (!data) return;
		const result = await preloadData(`/tickets/${data.ticket.key}`);
		if (result.type === 'loaded' && result.status === 200)
			replaceState('', { ticket: result.data as App.PageState['ticket'] });
		else if (result.type === 'loaded' && result.status === 404) close();
	}

	// Live-Update: der Hintergrund ist schon neu geladen (LiveUpdates), hier das offene Ticket
	$effect(() => {
		const onLive = () => void reloadTicket();
		window.addEventListener(LIVE_EVENT, onLive);
		return () => window.removeEventListener(LIVE_EVENT, onLive);
	});

	/** Links auf andere Tickets im Modal öffnen statt die Seite zu wechseln */
	function onclick(e: MouseEvent) {
		const a = (e.target as HTMLElement).closest('a');
		const m = a?.getAttribute('href')?.match(/^\/tickets\/([^/?#]+)$/);
		if (a && m && !a.hasAttribute('data-full')) openTicket(m[1], e, true);
	}
</script>

<Dialog.Root open={!!data} onOpenChange={(open) => !open && close()}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-5xl" {onclick}>
		{#if data}
			<Dialog.Header class="flex-row items-center gap-3 pr-8">
				<Dialog.Title class="text-muted-foreground font-mono text-sm font-normal">
					{data.project.key} / {#if data.parent}{data.parent.key} /
					{/if}{data.ticket.key}
				</Dialog.Title>
				<Hint text={m.open_as_separate_page()} side="bottom">
					{#snippet children(props)}
						<a
							{...props}
							href="/tickets/{data.ticket.key}"
							data-full
							class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'text-muted-foreground ml-auto' })}
							onclick={(e) => {
								if (e.metaKey || e.ctrlKey) return;
								e.preventDefault();
								goto(`/tickets/${data.ticket.key}`);
							}}
						>
							<Maximize2 />
							{m.open_as_page()}
						</a>
					{/snippet}
				</Hint>
			</Dialog.Header>
			<!-- Neu aufbauen bei anderem Ticket, damit keine ungespeicherten Eingaben mitwandern -->
			{#key data.ticket.id}
				<TicketView
					{data}
					{refresh}
					onDeleted={async () => {
						close();
						await invalidateAll();
					}}
				/>
			{/key}
		{/if}
	</Dialog.Content>
</Dialog.Root>
