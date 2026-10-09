<script lang="ts">
	import { PRIORITY_LABELS } from '$lib/api';
	import AssigneePicker from '$lib/components/AssigneePicker.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import type { TicketListItem } from '$lib/server/services/tickets';
	import { openTicket } from '$lib/ticket-modal';
	import { cn } from '$lib/utils';
	import Ban from '@lucide/svelte/icons/ban';
	import Calendar from '@lucide/svelte/icons/calendar';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Circle from '@lucide/svelte/icons/circle';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CornerDownRight from '@lucide/svelte/icons/corner-down-right';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Paperclip from '@lucide/svelte/icons/paperclip';

	let {
		t,
		parent,
		subtasks,
		users,
		me,
		expanded,
		dragging,
		onToggleSubtasks,
		onAssign,
		ondragstart,
		ondragend
	}: {
		t: TicketListItem;
		parent?: TicketListItem;
		/** Unteraufgaben für die aufklappbare Liste */
		subtasks: TicketListItem[];
		users: { id: string; name: string; email?: string }[];
		me?: string;
		expanded: boolean;
		dragging: boolean;
		onToggleSubtasks: () => void;
		onAssign: (id: string | null) => void;
		ondragstart: (e: DragEvent) => void;
		ondragend: (e: DragEvent) => void;
	} = $props();

	const blocked = $derived(t.openBlockers > 0 && !t.closed);
	const overdue = $derived(!t.closed && !!t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10));

	/** Fälligkeit kurz: "12.10.", in anderen Jahren mit Jahr */
	function shortDate(d: string) {
		const date = new Date(d);
		const sameYear = date.getFullYear() === new Date().getFullYear();
		return date.toLocaleDateString('de-DE', sameYear ? { day: '2-digit', month: '2-digit' } : undefined);
	}
</script>

<!-- Tags oben rechts in der Ecke: neben der ersten Zeile (Elternticket oder Titel) -->
{#snippet tagList()}
	{#if t.tags.length}
		<div class="flex max-w-[50%] shrink-0 flex-wrap justify-end gap-1">
			{#each t.tags as g (g.id)}<TagBadge name={g.name} color={g.color} />{/each}
		</div>
	{/if}
{/snippet}

<!-- Klick auf die Karte ist nur eine Abkürzung; per Tastatur führt der Titel-Link zum Ticket -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
	class={cn(
		'bg-card border-foreground/10 hover:border-foreground/25 flex cursor-grab flex-col gap-2 overflow-hidden rounded-md border px-3 py-2.5 text-sm transition-colors',
		blocked && 'border-l-warning border-l-[3px]',
		dragging && 'opacity-40'
	)}
	data-card={t.id}
	draggable="true"
	role="listitem"
	{ondragstart}
	{ondragend}
	onclick={(e) => openTicket(t.key, e)}
>
	{#if parent}
		<div class="-mb-0.5 flex items-start gap-2">
			<div class="text-muted-foreground flex min-h-5 min-w-0 grow items-center gap-1 text-xs" title="Unteraufgabe von {parent.key} {parent.title}">
				<CornerDownRight class="size-3 shrink-0" />
				<span class="shrink-0 font-mono">{parent.key}</span>
				<span class="truncate">{parent.title}</span>
			</div>
			{@render tagList()}
		</div>
	{/if}
	<div class="flex items-start gap-2">
		<a
			href="/tickets/{t.key}"
			class={cn('line-clamp-3 min-w-0 grow font-medium break-words hover:underline', t.closed && 'text-muted-foreground line-through')}
			onclick={(e) => (e.stopPropagation(), openTicket(t.key, e))}
			draggable="false">{t.title}</a
		>
		{#if !parent}{@render tagList()}{/if}
	</div>
	<div class="text-muted-foreground flex items-center gap-2.5 text-xs [&_svg]:size-3.5">
		<span class="flex items-center gap-1.5" title="Priorität: {PRIORITY_LABELS[t.priority]}">
			<span class="prio prio-{t.priority}"></span>
			<span class="font-mono">{t.key}</span>
		</span>
		{#if t.dueDate}
			<span
				class={cn('flex items-center gap-1', overdue && 'text-destructive font-medium')}
				title="Fällig am {new Date(t.dueDate).toLocaleDateString('de-DE')}{overdue ? ' (überfällig)' : ''}"
			>
				<Calendar /> {shortDate(t.dueDate)}
			</span>
		{/if}
		{#if blocked}
			<span class="text-warning flex items-center gap-1" title="Wartet auf {t.openBlockers} offene(s) Ticket(s)">
				<Ban /> {t.openBlockers}
			</span>
		{/if}
		{#if t.attachmentCount > 0}
			<span class="flex items-center gap-1" title="{t.attachmentCount} Anhang/Anhänge">
				<Paperclip /> {t.attachmentCount}
			</span>
		{/if}
		<span class="ml-auto">
			<AssigneePicker compact {users} {me} value={t.assigneeId} onchange={onAssign} />
		</span>
	</div>
	{#if t.subtaskCount > 0}
		<div class="-mx-3 -mb-2.5 border-t">
			<button
				type="button"
				class="text-muted-foreground hover:bg-muted/60 hover:text-foreground flex w-full items-center gap-1.5 px-3 py-1.5 text-xs"
				aria-expanded={expanded}
				title={expanded ? 'Unteraufgaben zuklappen' : 'Unteraufgaben aufklappen'}
				onclick={(e) => (e.stopPropagation(), onToggleSubtasks())}
			>
				<ChevronRight class={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
				<ListChecks class="size-3.5" />
				<span>Unteraufgaben</span>
				<span class="bg-muted ml-auto h-1 w-12 overflow-hidden rounded-full">
					<span
						class={cn('block h-full rounded-full', t.subtaskDone === t.subtaskCount ? 'bg-success' : 'bg-primary')}
						style="width: {(t.subtaskDone / t.subtaskCount) * 100}%"
					></span>
				</span>
				<span class={cn('tabular-nums', t.subtaskDone === t.subtaskCount && 'text-success')}>{t.subtaskDone}/{t.subtaskCount}</span>
			</button>
			{#if expanded && subtasks.length}
				<ul class="flex flex-col px-2 pb-1.5">
					{#each subtasks as s (s.id)}
						<li>
							<a
								href="/tickets/{s.key}"
								class="hover:bg-muted flex items-center gap-1.5 rounded px-1 py-0.5 text-xs"
								onclick={(e) => (e.stopPropagation(), openTicket(s.key, e))}
								draggable="false"
							>
								{#if s.closed}
									<CircleCheck class="text-success size-3.5 shrink-0" />
								{:else}
									<Circle class="text-muted-foreground size-3.5 shrink-0" />
								{/if}
								<span class="text-muted-foreground shrink-0 font-mono">{s.key}</span>
								<span class={cn('truncate', s.closed && 'text-muted-foreground line-through')}>{s.title}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
