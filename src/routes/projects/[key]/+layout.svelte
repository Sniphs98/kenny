<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import LiveUpdates from '$lib/components/LiveUpdates.svelte';
	import TicketModal from '$lib/components/TicketModal.svelte';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils';
	import ChartGantt from '@lucide/svelte/icons/chart-gantt';
	import Settings from '@lucide/svelte/icons/settings';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';

	let { data, children } = $props();

	const tabs = [
		{ href: 'board', label: m.board(), icon: SquareKanban },
		{ href: 'gantt', label: m.gantt(), icon: ChartGantt },
		{ href: 'settings', label: m.settings(), icon: Settings }
	];
	const open = $derived(data.tickets.filter((t) => !t.closed).length);
</script>

<svelte:head><title>{data.project.name} · Kenny</title></svelte:head>

<div class="bg-card border-b px-5 pt-5">
	<div class="flex items-center gap-3">
		<span class="bg-primary-soft text-primary grid size-10 place-items-center rounded-lg text-sm font-semibold">
			{data.project.key.slice(0, 2)}
		</span>
		<div>
			<h1 class="text-xl font-semibold tracking-tight">{data.project.name}</h1>
			<div class="text-muted-foreground text-xs">
				<span class="font-mono">{data.project.key}</span>
				{m.open_out_of_tickets({ value1: open, value2: data.tickets.length })}
			</div>
		</div>
	</div>
	<nav class="mt-4 flex gap-1">
		{#each tabs as t (t.href)}
			{@const active = page.route.id?.endsWith('/' + t.href)}
			<a
				href="/projects/{data.project.key}/{t.href}"
				class={cn(
					'text-muted-foreground hover:text-foreground -mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors',
					active && 'border-primary text-foreground'
				)}
			>
				<t.icon class="size-4" />
				{t.label}
			</a>
		{/each}
	</nav>
</div>

{@render children()}

<TicketModal />
<LiveUpdates
	project={data.project.key}
	onDeleted={() => {
		toast.info(m.project_was_deleted());
		goto('/', { invalidateAll: true });
	}}
/>
