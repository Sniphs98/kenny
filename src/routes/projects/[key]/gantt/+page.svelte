<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Gantt from '$lib/components/Gantt.svelte';
	import Hint from '$lib/components/Hint.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	let dialog: TicketDialog;

	const DAY = 86_400_000;
	const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
	const today = Math.floor(Date.now() / DAY);
	/** Neue Tickets im Gantt starten heute und dauern drei Tage */
	const preset = () => ({ startDate: fromDay(today), dueDate: fromDay(today + 3) });
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
		<Hint text={m.new_ticket_shortcut()} disabled={!data.canEdit}>
			{#snippet children(props)}
				<Button
					{...props}
					disabled={!data.canEdit}
					size="sm"
					aria-keyshortcuts="C"
					onclick={() => dialog.open(preset())}
				>
					<Plus />
					{m.ticket()}
				</Button>
			{/snippet}
		</Hint>
	{/snippet}
</Gantt>

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	tags={data.tags}
	parents={data.tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` }))}
	canCreate={data.canEdit}
	shortcutPreset={preset}
/>
