<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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

<Gantt
	readOnly={!data.canEdit}
	tickets={data.tickets}
	dependencies={data.dependencies}
	columns={data.columns}
	projectKey={data.project.key}
	color={data.project.color}
>
	{#snippet actions()}
		<Button
			disabled={!data.canEdit}
			size="sm"
			onclick={() => dialog.open({ startDate: fromDay(today), dueDate: fromDay(today + 3) })}
		>
			<Plus />
			{m.ticket()}
		</Button>
	{/snippet}
</Gantt>

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	tags={data.tags}
	parents={data.tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` }))}
/>
