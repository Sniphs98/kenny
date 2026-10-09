<script lang="ts">
	import { goto, invalidateAll, preloadData, refreshAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import TicketView from '$lib/components/TicketView.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
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
				<a
					href="/tickets/{data.ticket.key}"
					data-full
					class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'text-muted-foreground ml-auto' })}
					title="Als eigene Seite öffnen"
					onclick={(e) => {
						if (e.metaKey || e.ctrlKey) return;
						e.preventDefault();
						goto(`/tickets/${data.ticket.key}`);
					}}
				>
					<Maximize2 /> Als Seite öffnen
				</a>
			</Dialog.Header>
			<TicketView
				{data}
				{refresh}
				onDeleted={async () => {
					close();
					await invalidateAll();
				}}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
