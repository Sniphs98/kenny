<script lang="ts">
	import { PRIORITIES, type UpdateTicketInput } from '$lib/contracts';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from '../../routes/tickets/[key]/$types';
	import { page } from '$app/state';
	import { api, updateTicket, PRIORITY_LABELS } from '$lib/api';
	import AssigneePicker from '$lib/components/AssigneePicker.svelte';
	import Attachments from '$lib/components/Attachments.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import AlignLeft from '@lucide/svelte/icons/align-left';
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Link2 from '@lucide/svelte/icons/link-2';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	let {
		data,
		refresh = invalidateAll,
		onDeleted
	}: {
		data: PageData;
		/** Lädt die Daten nach einer Änderung neu (im Modal anders als auf der Seite) */
		refresh?: () => Promise<void>;
		/** Wird nach dem Löschen aufgerufen; ohne Angabe geht es zurück zum Board */
		onDeleted?: () => void;
	} = $props();

	const t = $derived(data.ticket);
	const base = $derived(`/tickets/${data.ticket.id}`);

	let title = $state('');
	let description = $state('');
	let editingDesc = $state(false);
	$effect(() => {
		title = data.ticket.title;
		description = data.ticket.description;
	});

	let newSubtask = $state('');
	let linkType = $state<'depends_on' | 'blocks' | 'relates'>('depends_on');
	let linkTarget = $state('');
	let confirmDelete = $state(false);

	const LINK_TYPES = { depends_on: 'setzt voraus', blocks: 'ist Voraussetzung für', relates: 'verknüpft mit' };

	async function run(fn: () => Promise<unknown>) {
		try {
			await fn();
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	const patch = (body: UpdateTicketInput) => run(() => updateTicket(t.id, body));

	async function saveTitle() {
		if (title.trim() && title !== t.title) await patch({ title });
	}

	async function saveDescription() {
		await patch({ description });
		editingDesc = false;
	}

	async function addSubtask(e: SubmitEvent) {
		e.preventDefault();
		if (!newSubtask.trim()) return;
		await run(() => api('POST', `${base}/subtasks`, { title: newSubtask }));
		newSubtask = '';
	}

	async function addLink(e: SubmitEvent) {
		e.preventDefault();
		if (!linkTarget.trim()) return;
		await run(() => api('POST', `${base}/links`, { type: linkType, target: linkTarget.trim() }));
		linkTarget = '';
	}

	async function remove() {
		await api('DELETE', base);
		toast.success(`Ticket ${t.key} gelöscht`);
		if (onDeleted) onDeleted();
		else await goto(`/projects/${data.project.key}/board`, { invalidateAll: true });
	}

	const groups = $derived([
		{ label: 'Setzt voraus', items: data.links.filter((l) => l.relation === 'depends_on') },
		{ label: 'Ist Voraussetzung für', items: data.links.filter((l) => l.relation === 'blocks') },
		{ label: 'Verknüpft mit', items: data.links.filter((l) => l.relation === 'relates') }
	]);
	const openBlockers = $derived(data.links.filter((l) => l.relation === 'depends_on' && !l.ticket.closed));
	const linkCandidates = $derived(data.projectTickets.filter((o) => o.id !== t.id));
	const parentCandidates = $derived(
		data.projectTickets.filter((o) => o.id !== t.id && !data.subtasks.some((s) => s.id === o.id))
	);
	const subDone = $derived(data.subtasks.filter((s) => s.closed).length);
	const columnName = $derived(data.columns.find((c) => c.id === t.columnId)?.name ?? '');
	const parentLabel = $derived.by(() => {
		const p = parentCandidates.find((o) => o.id === t.parentId);
		return p ? `${p.key} ${p.title}` : 'Keinem Ticket';
	});
</script>

<div class="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
	<div class="flex min-w-0 flex-col gap-4">
		<input
			class="hover:border-border focus-visible:border-ring focus-visible:ring-ring/50 -ml-2 rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight outline-none focus-visible:ring-3"
			bind:value={title}
			onblur={saveTitle}
			onkeydown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
			aria-label="Titel"
		/>

		{#if t.closed}
			<Alert.Root class="text-success border-success/30 bg-success/5">
				<CircleCheck />
				<Alert.Title>Abgeschlossen am {new Date(t.closedAt!).toLocaleString('de-DE')}</Alert.Title>
			</Alert.Root>
		{:else if openBlockers.length}
			<Alert.Root class="text-warning border-warning/30 bg-warning/5">
				<Ban />
				<Alert.Title>
					Wartet auf {openBlockers.length} offene{openBlockers.length === 1 ? 's' : ''} Ticket{openBlockers.length === 1
						? ''
						: 's'}:
					{#each openBlockers as b, i (b.id)}<a class="underline" href="/tickets/{b.ticket.key}">{b.ticket.key}</a>{i <
						openBlockers.length - 1
							? ', '
							: ''}{/each}
				</Alert.Title>
			</Alert.Root>
		{/if}

		<Card.Root class="gap-4">
			<Card.Header class="flex items-center gap-2">
				<AlignLeft class="text-muted-foreground size-4" />
				<Card.Title class="grow">Beschreibung</Card.Title>
				{#if !editingDesc}
					<Button variant="ghost" size="sm" onclick={() => (editingDesc = true)}><Pencil /> Bearbeiten</Button>
				{/if}
			</Card.Header>
			<Card.Content>
				{#if editingDesc}
					<Textarea bind:value={description} rows={8} />
					<div class="mt-3 flex gap-2">
						<Button onclick={saveDescription}>Speichern</Button>
						<Button variant="outline" onclick={() => ((editingDesc = false), (description = t.description))}
							>Abbrechen</Button
						>
					</div>
				{:else if t.description}
					<p class="whitespace-pre-wrap">{t.description}</p>
				{:else}
					<p class="text-muted-foreground">Keine Beschreibung.</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="gap-4">
			<Card.Header class="flex items-center gap-2">
				<ListChecks class="text-muted-foreground size-4" />
				<Card.Title class="grow">Unteraufgaben</Card.Title>
				{#if data.subtasks.length}
					<Badge variant="secondary" class={cn(subDone === data.subtasks.length && 'text-success')}
						>{subDone}/{data.subtasks.length}</Badge
					>
				{/if}
			</Card.Header>
			<Card.Content>
				{#if data.subtasks.length}
					<ul class="-mx-2 mb-3 flex flex-col">
						{#each data.subtasks as s (s.id)}
							<li class="hover:bg-muted flex items-center gap-2.5 rounded-md px-2 py-1.5">
								<Checkbox
									checked={s.closed}
									onCheckedChange={() => run(() => api('POST', `/tickets/${s.id}/${s.closed ? 'reopen' : 'close'}`))}
									aria-label="Erledigt"
								/>
								<a
									href="/tickets/{s.key}"
									class={cn('min-w-0 grow truncate', s.closed && 'text-muted-foreground line-through')}
								>
									<span class="text-muted-foreground mr-1 font-mono text-xs">{s.key}</span>
									{s.title}
								</a>
								<Badge variant="outline">{s.status}</Badge>
							</li>
						{/each}
					</ul>
				{/if}
				<form class="flex gap-2" onsubmit={addSubtask}>
					<Input placeholder="Neue Unteraufgabe" bind:value={newSubtask} />
					<Button type="submit" variant="outline"><Plus /> Hinzufügen</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root class="gap-4">
			<Card.Header class="flex items-center gap-2">
				<Link2 class="text-muted-foreground size-4" />
				<Card.Title class="grow">Verknüpfungen</Card.Title>
			</Card.Header>
			<Card.Content>
				{#each groups as g (g.label)}
					{#if g.items.length}
						<div class="text-muted-foreground mt-1 mb-1 text-xs font-semibold tracking-wide uppercase">{g.label}</div>
						<ul class="-mx-2 mb-3 flex flex-col">
							{#each g.items as l (l.id)}
								<li class="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1">
									<a
										href="/tickets/{l.ticket.key}"
										class={cn('min-w-0 grow truncate', l.ticket.closed && 'text-muted-foreground line-through')}
									>
										<span class="text-muted-foreground mr-1 font-mono text-xs">{l.ticket.key}</span>
										{l.ticket.title}
									</a>
									{#if l.ticket.closed}<Badge variant="secondary" class="text-success">erledigt</Badge>{/if}
									<Button
										variant="ghost"
										size="icon-xs"
										class="hover:text-destructive"
										title="Verknüpfung entfernen"
										aria-label="Verknüpfung entfernen"
										onclick={() => run(() => api('DELETE', `${base}/links/${l.id}`))}><X /></Button
									>
								</li>
							{/each}
						</ul>
					{/if}
				{/each}
				<form class="flex flex-wrap gap-2" onsubmit={addLink}>
					<Select.Root type="single" bind:value={linkType}>
						<Select.Trigger class="w-48">{LINK_TYPES[linkType]}</Select.Trigger>
						<Select.Content>
							{#each Object.entries(LINK_TYPES) as [v, l] (v)}
								<Select.Item value={v}>{l}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<Input
						class="min-w-40 flex-1"
						list="ticket-options"
						placeholder="Ticket, z.B. {data.project.key}-1"
						bind:value={linkTarget}
					/>
					<datalist id="ticket-options">
						{#each linkCandidates as o (o.id)}<option value={o.key}>{o.title}</option>{/each}
					</datalist>
					<Button type="submit" variant="outline"><Link2 /> Verknüpfen</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Attachments ticketId={t.id} attachments={data.attachments} {refresh} />
	</div>

	<Card.Root class="gap-4 py-5">
		<Card.Content class="flex flex-col gap-4 px-5">
			{#if t.closed}
				<Button variant="outline" onclick={() => run(() => api('POST', `${base}/reopen`))}
					><RotateCcw /> Wieder öffnen</Button
				>
			{:else}
				<Button onclick={() => run(() => api('POST', `${base}/close`))}><Check /> Abschließen</Button>
			{/if}

			<div class="grid gap-2">
				<Label>Status</Label>
				<Select.Root type="single" value={String(t.columnId)} onValueChange={(v) => patch({ columnId: Number(v) })}>
					<Select.Trigger class="w-full">{columnName}</Select.Trigger>
					<Select.Content>
						{#each data.columns as c (c.id)}<Select.Item value={String(c.id)}>{c.name}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-2">
				<Label>Priorität</Label>
				<Select.Root
					type="single"
					value={t.priority}
					onValueChange={(v) => {
						const priority = PRIORITIES.find((p) => p === v);
						if (priority) patch({ priority });
					}}
				>
					<Select.Trigger class="w-full">
						<span class="flex items-center gap-2"
							><span class="prio prio-{t.priority}"></span>{PRIORITY_LABELS[t.priority]}</span
						>
					</Select.Trigger>
					<Select.Content>
						{#each Object.entries(PRIORITY_LABELS) as [v, l] (v)}
							<Select.Item value={v}><span class="prio prio-{v}"></span>{l}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-2">
				<Label>Tags</Label>
				<TagPicker tags={data.tags} value={t.tags.map((g) => g.id)} onchange={(tags) => patch({ tags })} />
			</div>
			<div class="grid gap-2">
				<Label>Zuständig</Label>
				<AssigneePicker
					users={data.users}
					me={page.data.user?.id}
					value={t.assigneeId}
					onchange={(id) => patch({ assigneeId: id })}
				/>
				{#if page.data.user && t.assigneeId !== page.data.user.id}
					<Button
						variant="link"
						size="xs"
						class="-mt-1 h-auto self-start px-0"
						onclick={() => patch({ assigneeId: page.data.user!.id })}
					>
						Mir zuweisen
					</Button>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="start">Start</Label>
				<DatePicker id="start" value={t.startDate} onchange={(d) => patch({ startDate: d })} />
			</div>
			<div class="grid gap-2">
				<Label for="due">Fällig</Label>
				<DatePicker id="due" value={t.dueDate} min={t.startDate} onchange={(d) => patch({ dueDate: d })} />
			</div>
			<div class="grid gap-2">
				<Label>Unteraufgabe von</Label>
				<Select.Root
					type="single"
					value={t.parentId ? String(t.parentId) : ''}
					onValueChange={(v) => patch({ parentId: v ? Number(v) : null })}
				>
					<Select.Trigger class="w-full"><span class="truncate">{parentLabel}</span></Select.Trigger>
					<Select.Content class="max-h-72">
						<Select.Item value="">Keinem Ticket</Select.Item>
						{#each parentCandidates as o (o.id)}<Select.Item value={String(o.id)}>{o.key} {o.title}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<Separator />
			<div class="text-muted-foreground flex flex-col gap-0.5 text-xs">
				<span>Erstellt {new Date(t.createdAt).toLocaleString('de-DE')}</span>
				<span>Geändert {new Date(t.updatedAt).toLocaleString('de-DE')}</span>
			</div>
			<Button variant="destructive" onclick={() => (confirmDelete = true)}><Trash2 /> Ticket löschen</Button>
		</Card.Content>
	</Card.Root>
</div>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Ticket {t.key} löschen?</AlertDialog.Title>
			<AlertDialog.Description>
				{#if data.subtasks.length}
					Das Ticket und seine {data.subtasks.length} Unteraufgabe(n) werden endgültig gelöscht.
				{:else}
					Das Ticket wird endgültig gelöscht.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Abbrechen</AlertDialog.Cancel>
			<AlertDialog.Action class="bg-destructive hover:bg-destructive/90 text-white" onclick={remove}
				>Löschen</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
