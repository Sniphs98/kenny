<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Gantt from '#lib/components/Gantt.svelte';
	import TicketDialog from '#lib/components/TicketDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	let dialog: TicketDialog;

	const DAY = 86_400_000;
	const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
	const today = Math.floor(Date.now() / DAY);
	/** Neue Versionen im Gantt starten heute und dauern drei Tage */
	const preset = () => ({ kind: 'version' as const, startDate: fromDay(today), dueDate: fromDay(today + 3) });
	function addMain(version: (typeof data.tickets)[number]) {
		const startDate = version.startDate ?? fromDay(today);
		const dueDate =
			version.startDate && version.dueDate ? version.dueDate : fromDay(Math.floor(Date.parse(startDate) / DAY) + 3);
		dialog.open({ kind: 'main', parentId: String(version.id), startDate, dueDate });
	}
</script>

<Gantt
	readOnly={!data.canEdit}
	tickets={data.tickets}
	dependencies={data.dependencies}
	columns={data.columns}
	projectKey={data.project.key}
	color={data.project.color}
	onAddMain={addMain}
>
	{#snippet actions()}
		<Button disabled={!data.canEdit} size="sm" onclick={() => dialog.open(preset())}>
			<Plus />
			{m.version()}
		</Button>
	{/snippet}
</Gantt>

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	tags={data.tags}
	buckets={data.buckets}
	parents={data.tickets.filter((t) => t.kind !== 'task').map((t) => ({ id: t.id, label: t.title, kind: t.kind }))}
	canCreate={data.canEdit}
	canManage={data.canManage}
	{preset}
/>
