<script lang="ts">
	import LiveUpdates from '$lib/components/LiveUpdates.svelte';
	import TicketView from '$lib/components/TicketView.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	let { data } = $props();
</script>

<svelte:head><title>{data.ticket.key} {data.ticket.title} · Kenny</title></svelte:head>

<div class="mx-auto max-w-6xl px-5 py-6">
	<Breadcrumb.Root class="mb-4">
		<Breadcrumb.List>
			<Breadcrumb.Item class="min-w-0 max-w-full">
				<Breadcrumb.Link class="truncate" href="/projects/{data.project.key}/board">{data.project.name}</Breadcrumb.Link
				>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			{#if data.parent}
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/tickets/{data.parent.key}">{data.parent.key}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
			{/if}
			<Breadcrumb.Item>
				<Breadcrumb.Page class="font-mono text-xs">{data.ticket.key}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<!-- Neu aufbauen bei anderem Ticket, damit keine ungespeicherten Eingaben mitwandern -->
	{#key data.ticket.id}
		<TicketView {data} />
	{/key}
</div>

<LiveUpdates project={data.project.key} />
