<script lang="ts">
	import { intlLocale } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { refreshStoredTicketStatuses, type StoredTicketStatus } from '#lib/ticket-status-storage.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { onMount } from 'svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Clock3 from '@lucide/svelte/icons/clock-3';
	import Inbox from '@lucide/svelte/icons/inbox';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let tickets = $state<StoredTicketStatus[]>([]);
	let loading = $state(true);
	let loadError = $state(false);
	const openTickets = $derived(tickets.filter((ticket) => !ticket.closed));
	const completedTickets = $derived(tickets.filter((ticket) => ticket.closed));

	async function loadTickets() {
		loading = true;
		loadError = false;
		try {
			tickets = await refreshStoredTicketStatuses();
		} catch {
			tickets = [];
			loadError = true;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadTickets();
	});
</script>

<svelte:head>
	<title>{m.my_tickets()} · Kenny</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet ticketCard(ticket: StoredTicketStatus, completed: boolean)}
	<a
		href={ticket.path}
		class={completed
			? 'group bg-muted/35 relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:bg-muted/55 hover:shadow-sm'
			: 'group bg-card relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md'}
		style="--ticket-color: {ticket.projectColor ?? '#6366f1'}"
	>
		<span
			class="absolute inset-y-0 left-0 w-1"
			style={completed ? 'background: var(--success)' : 'background: var(--ticket-color)'}
		></span>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{ticket.projectName ?? m.ticket()}</p>
				<p class={completed ? 'text-muted-foreground mt-1 text-xs font-semibold' : 'mt-1 text-xs font-semibold'} style={completed ? undefined : 'color: var(--ticket-color)'}>{ticket.key}</p>
			</div>
			<span
				class={completed
					? 'bg-success/10 text-success inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium'
					: 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium'}
				style={completed
					? undefined
					: 'background: color-mix(in srgb, var(--ticket-color) 12%, transparent); color: color-mix(in srgb, var(--ticket-color) 70%, var(--foreground))'}
			>
				{#if completed}<CircleCheck class="size-3.5" />{:else}<Clock3 class="size-3.5" />{/if}
				{ticket.status}
			</span>
		</div>
		<h2 class={completed ? 'text-muted-foreground mt-4 line-clamp-2 min-h-12 text-base font-semibold leading-6' : 'mt-4 line-clamp-2 min-h-12 text-base font-semibold leading-6'}>{ticket.title}</h2>
		<div class="text-muted-foreground mt-5 flex items-center justify-between gap-3 border-t pt-4 text-xs">
			<span class="flex min-w-0 items-center gap-1.5">
				<Clock3 class="size-3.5 shrink-0" />
				<span class="truncate">{m.ticket_updated_at({ date: new Date(ticket.updatedAt!).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }) })}</span>
			</span>
			<ArrowRight class="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
		</div>
	</a>
{/snippet}

<div class="min-h-screen bg-background bg-[radial-gradient(circle_at_50%_0%,var(--primary-soft),transparent_52%)] px-4 py-12">
	<div class="mx-auto grid w-full max-w-3xl gap-7">
		<header class="flex flex-col items-center text-center">
			<span class="bg-primary text-primary-foreground grid size-12 place-items-center rounded-2xl shadow-lg">
				<Inbox class="size-6" />
			</span>
			<h1 class="mt-4 text-3xl font-semibold tracking-tight">{m.my_tickets()}</h1>
			<p class="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">{m.my_tickets_description()}</p>
		</header>

		{#if loading}
			<Card.Root>
				<Card.Content class="flex items-center justify-center gap-3 py-10 text-sm">
					<LoaderCircle class="text-primary size-5 animate-spin" /> {m.loading_ticket_statuses()}
				</Card.Content>
			</Card.Root>
		{:else if loadError}
			<Card.Root>
				<Card.Content class="flex flex-col items-center gap-3 py-10 text-center">
					<CircleAlert class="text-destructive size-9" />
					<p class="font-medium">{m.ticket_statuses_load_failed()}</p>
					<p class="text-muted-foreground text-sm">{m.ticket_statuses_load_failed_description()}</p>
					<Button variant="outline" onclick={loadTickets}>{m.try_again()}</Button>
				</Card.Content>
			</Card.Root>
		{:else if tickets.length}
			{#if openTickets.length}
				<section class="grid gap-3">
					<h2 class="flex items-center gap-2 text-sm font-semibold">
						{m.open_tickets()} <span class="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">{openTickets.length}</span>
					</h2>
					<div class="grid gap-4 sm:grid-cols-2">
						{#each openTickets as ticket (ticket.key)}{@render ticketCard(ticket, false)}{/each}
					</div>
				</section>
			{/if}

			{#if completedTickets.length}
				<section class="mt-3 grid gap-3 border-t pt-7">
					<h2 class="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
						<CircleCheck class="text-success size-4" /> {m.completed_tickets()}
						<span class="bg-muted rounded-full px-2 py-0.5 text-xs">{completedTickets.length}</span>
					</h2>
					<div class="grid gap-4 sm:grid-cols-2">
						{#each completedTickets as ticket (ticket.key)}{@render ticketCard(ticket, true)}{/each}
					</div>
				</section>
			{/if}
		{:else}
			<Card.Root>
				<Card.Content class="flex flex-col items-center gap-3 py-10 text-center">
					<Inbox class="text-muted-foreground size-9" />
					<p class="font-medium">{m.no_saved_tickets()}</p>
					<p class="text-muted-foreground max-w-md text-sm">{m.no_saved_tickets_description()}</p>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
