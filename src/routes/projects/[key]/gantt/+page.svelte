<script lang="ts">
	import Gantt from '$lib/components/Gantt.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	let dialog: TicketDialog;

	const DAY = 86_400_000;
	const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
	const today = Math.floor(Date.now() / DAY);
</script>

<Gantt tickets={data.tickets} dependencies={data.dependencies} color={data.project.color}>
	{#snippet actions()}
		<Button size="sm" onclick={() => dialog.open({ startDate: fromDay(today), dueDate: fromDay(today + 3) })}>
			<Plus /> Ticket
		</Button>
	{/snippet}
</Gantt>

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	parents={data.tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` }))}
/>
