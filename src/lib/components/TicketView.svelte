<script lang="ts">
	import { withBase } from '#lib/paths.js';
	import { intlLocale } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { PRIORITIES, type UpdateTicketInput } from '#lib/contracts/index.js';
	import { goto, refreshAll } from '$app/navigation';
	import type { PageData } from '../../routes/tickets/[key]/$types';
	import { page } from '$app/state';
	import { api, closeTicket, reopenTicket, updateTicket, PRIORITY_LABELS } from '#lib/api.js';
	import AssigneePicker from '#lib/components/AssigneePicker.svelte';
	import Attachments from '#lib/components/Attachments.svelte';
	import TicketComments from '#lib/components/TicketComments.svelte';
	import MarkdownEditor from '#lib/components/MarkdownEditor.svelte';
	import MarkdownViewer from '#lib/components/MarkdownViewer.svelte';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import TicketPicker from '#lib/components/TicketPicker.svelte';
	import TagBadge from '#lib/components/TagBadge.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import Hint from '#lib/components/Hint.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { cn } from '#lib/utils.js';
	import { autosize } from '#lib/autosize.js';
	import { Synced } from '#lib/synced.svelte.js';
	import { untrack } from 'svelte';
	import { playIfCompleted } from '#lib/sound.js';
	import { toast } from 'svelte-sonner';
	import AlignLeft from '@lucide/svelte/icons/align-left';
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Link2 from '@lucide/svelte/icons/link-2';
	import List from '@lucide/svelte/icons/list';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	let {
		data,
		refresh = refreshAll,
		onDeleted
	}: {
		data: PageData;
		/** Lädt die Daten nach einer Änderung neu (im Modal anders als auf der Seite) */
		refresh?: () => Promise<void>;
		/** Wird nach dem Löschen aufgerufen; ohne Angabe geht es zurück zum Board */
		onDeleted?: () => void;
	} = $props();

	const t = $derived(data.ticket);
	const today = () => new Date().toISOString().slice(0, 10);
	const base = $derived(`/tickets/${data.ticket.id}`);

	// Lokale Kopien; Live-Updates überschreiben keine ungespeicherten Eingaben
	const title = new Synced(untrack(() => data.ticket.title));
	const description = new Synced(untrack(() => data.ticket.description));
	let descriptionUploads = $state(0);
	$effect(() => title.update(data.ticket.title));
	$effect(() => description.update(data.ticket.description));

	/** Sofort sichtbare Auswahl, damit mehrere Klicks hintereinander aufeinander aufbauen */
	let assigneeIds = $state(untrack(() => data.ticket.assigneeIds));
	$effect(() => {
		assigneeIds = data.ticket.assigneeIds;
	});

	let newSubtask = $state('');
	let linkType = $state<'depends_on' | 'blocks' | 'relates'>('depends_on');
	let linkTarget = $state('');
	let confirmDelete = $state(false);
	let taskView = $state<'list' | 'board'>('list');

	const LINK_TYPES = { depends_on: m.depends_on(), blocks: m.blocks(), relates: m.related_to() };

	async function run(fn: () => Promise<unknown>) {
		if (!data.canEdit) return;
		try {
			await fn();
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	const patch = (body: UpdateTicketInput) => run(() => updateTicket(t.id, body));

	async function saveTitle() {
		// Eingefügte Zeilenumbrüche gehören nicht in den Titel
		const value = title.value.replace(/\s*\n\s*/g, ' ');
		if (value !== title.value) title.value = value;
		if (value.trim() && value !== t.title) await patch({ title: value });
	}

	let descriptionSave = Promise.resolve();
	function saveDescription() {
		if (!description.dirty) return;
		const value = description.value;
		descriptionSave = descriptionSave.then(() => run(() => updateTicket(t.id, { description: value })));
	}

	/** Unteraufgaben nacheinander anlegen, auch wenn schnell hintereinander Enter gedrückt wird */
	let subtaskQueue = Promise.resolve();

	function addSubtask(e: SubmitEvent) {
		e.preventDefault();
		const title = newSubtask.trim();
		if (!title || !data.canEdit) return;
		// Feld sofort leeren, damit die nächste Eingabe nicht vom Abschluss dieser überschrieben wird
		newSubtask = '';
		subtaskQueue = subtaskQueue.then(async () => {
			try {
				await api('POST', `${base}/subtasks`, { title });
				await refresh();
			} catch (err) {
				toast.error((err as Error).message);
				// Eingabe zurückgeben, damit nichts verloren geht
				if (!newSubtask) newSubtask = title;
			}
		});
		return subtaskQueue;
	}

	async function addLink(e: SubmitEvent) {
		e.preventDefault();
		if (!linkTarget.trim()) return;
		await run(() => api('POST', `${base}/links`, { type: linkType, target: linkTarget.trim() }));
		linkTarget = '';
	}

	async function remove() {
		await api('DELETE', base);
		toast.success(
			data.submission ? m.deleted_submitted_ticket({ value1: t.title }) : m.deleted_ticket({ value1: t.title })
		);
		if (onDeleted) onDeleted();
		else await goto(withBase(`/projects/${data.project.key}/board`), { refreshAll: true });
	}

	const groups = $derived([
		{ label: m.depends_on_2(), items: data.links.filter((l) => l.relation === 'depends_on') },
		{ label: m.blocks_2(), items: data.links.filter((l) => l.relation === 'blocks') },
		{ label: m.related_to_2(), items: data.links.filter((l) => l.relation === 'relates') }
	]);
	const openBlockers = $derived(data.links.filter((l) => l.relation === 'depends_on' && !l.ticket.closed));
	// Bereits verknüpfte Tickets nicht noch einmal anbieten
	const linkCandidates = $derived(
		data.projectTickets.filter((o) => o.id !== t.id && !data.links.some((l) => l.ticket.key === o.key))
	);
	const parentCandidates = $derived(
		data.projectTickets.filter(
			(o) =>
				o.id !== t.id &&
				!data.subtasks.some((s) => s.id === o.id) &&
				o.kind === (t.kind === 'task' ? 'main' : 'version')
		)
	);
	const activeColumnId = $derived(data.columns.filter((column) => !column.isBacklog && !column.isDone)[1]?.id);
	const parentState = (o: (typeof data.projectTickets)[number]) =>
		o.closed ? 'done' : o.columnId === activeColumnId ? 'active' : 'open';
	const parentGroups = $derived.by(() => {
		if (t.kind !== 'task') return [];
		const versions = data.projectTickets
			.filter((o) => o.kind === 'version')
			.sort(
				(a, b) =>
					(a.startDate ?? a.dueDate ?? '9999-12-31').localeCompare(b.startDate ?? b.dueDate ?? '9999-12-31') ||
					(a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
					a.position - b.position ||
					a.number - b.number
			);
		const mainTasks = parentCandidates.filter((o) => o.kind === 'main');
		const groups = versions
			.map((version) => ({
				key: String(version.id),
				label: version.title,
				state: parentState(version),
				tasks: mainTasks.filter((o) => o.parentId === version.id)
			}))
			.filter((group) => group.tasks.length);
		const withoutVersion = mainTasks.filter((o) => !versions.some((version) => version.id === o.parentId));
		if (withoutVersion.length)
			groups.push({ key: 'none', label: m.no_version(), state: 'open', tasks: withoutVersion });
		return groups;
	});
	const subDone = $derived(data.subtasks.filter((s) => s.closed).length);
	const columnName = $derived(data.columns.find((c) => c.id === t.columnId)?.name ?? '');
	const inTicketSystem = $derived(
		t.kind === 'task' &&
			t.parentId === null &&
			(t.boardGroup === 'tickets' || (t.boardGroup === null && data.submission !== null))
	);
	const parentValue = $derived(t.parentId ? String(t.parentId) : inTicketSystem ? 'tickets' : '');
	const parentLabel = $derived.by(() => {
		const p = parentCandidates.find((o) => o.id === t.parentId);
		return p ? p.title : t.kind === 'main' ? m.no_version() : inTicketSystem ? m.ticket_system() : m.no_main_task();
	});
</script>

{#if !data.canEdit}<p class="text-muted-foreground mb-4 text-sm">{m.um_read_only()}</p>{/if}
<div class="flex min-w-0 flex-col gap-4">
	<!-- Mehrzeilig, damit lange Titel umbrechen statt abgeschnitten zu werden; Enter speichert -->
	<textarea
		class="hover:border-border focus-visible:border-ring focus-visible:ring-ring/50 -ml-2 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight break-words outline-none focus-visible:ring-3"
		rows="1"
		readonly={!data.canEdit}
		bind:value={title.value}
		{@attach autosize(() => title.value)}
		onblur={saveTitle}
		onkeydown={(e) => {
			if (e.key !== 'Enter' && e.key !== 'Escape') return;
			e.preventDefault();
			e.currentTarget.blur();
		}}
		aria-label={m.title()}></textarea>
	{#if data.submission}
		<div
			class="text-muted-foreground -mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs"
			data-submission-header
		>
			{#if data.submission.email}
				<span
					>{m.submitted_by()}
					<a class="text-primary hover:underline" href="mailto:{data.submission.email}">{data.submission.email}</a
					></span
				>
			{/if}
			{#if data.submission.system}<span>{m.system()}: {data.submission.system}</span>{/if}
			<span>{m.created({ value1: new Date(t.createdAt).toLocaleString(intlLocale()) })}</span>
		</div>
	{/if}

	{#if t.closed}
		<Alert.Root class="text-success border-success/30 bg-success/5">
			<CircleCheck />
			<Alert.Title>{m.completed_on({ value1: new Date(t.closedAt!).toLocaleString(intlLocale()) })}</Alert.Title>
		</Alert.Root>
	{:else if openBlockers.length}
		<Alert.Root class="text-warning border-warning/30 bg-warning/5">
			<Ban />
			<Alert.Title>
				{openBlockers.length === 1
					? m.waiting_for_one_ticket()
					: m.waiting_for_many_tickets({ count: openBlockers.length })}
				{#each openBlockers as b, i (b.id)}<a class="underline" href={withBase(`/tickets/${b.ticket.key}`)}
						>{b.ticket.title}</a
					>{i < openBlockers.length - 1 ? ', ' : ''}{/each}
			</Alert.Title>
		</Alert.Root>
	{/if}

	<div class="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
		<div class="flex min-w-0 flex-col gap-4">
			<Card.Root class="relative z-10 gap-0 overflow-visible py-0">
				<Card.Header class="flex items-center gap-2 rounded-t-xl border-b pt-4 pb-1.5!">
					<AlignLeft class="text-muted-foreground size-4" />
					<Card.Title class="grow">{m.description()}</Card.Title>
					{#if descriptionUploads}<span class="text-muted-foreground text-xs">{m.uploading()}</span>{/if}
				</Card.Header>
				<Card.Content class={data.canEdit ? 'px-0' : 'py-4'}>
					{#if data.canEdit}
						<MarkdownEditor
							bind:value={description.value}
							bind:uploadCount={descriptionUploads}
							ticketId={t.id}
							{refresh}
							onSave={saveDescription}
						/>
					{:else if description.value}
						<MarkdownViewer value={description.value} />
					{:else}
						<p class="text-muted-foreground">{m.no_description()}</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class="gap-4">
				<Card.Header class="flex items-center gap-2">
					<ListChecks class="text-muted-foreground size-4" />
					<Card.Title class="grow"
						>{t.kind === 'version' ? m.main_tasks() : t.kind === 'main' ? m.tasks() : m.subtasks()}</Card.Title
					>
					{#if data.subtasks.length}
						<Badge variant="secondary" class={cn(subDone === data.subtasks.length && 'text-success')}
							>{subDone}/{data.subtasks.length}</Badge
						>
					{/if}
					{#if t.kind === 'main'}
						<div class="flex rounded-md border p-0.5" aria-label={m.appearance()}>
							<Button
								variant={taskView === 'list' ? 'secondary' : 'ghost'}
								size="icon-xs"
								aria-label={m.list()}
								aria-pressed={taskView === 'list'}
								onclick={() => (taskView = 'list')}><List /></Button
							>
							<Button
								variant={taskView === 'board' ? 'secondary' : 'ghost'}
								size="icon-xs"
								aria-label={m.board()}
								aria-pressed={taskView === 'board'}
								onclick={() => (taskView = 'board')}><SquareKanban /></Button
							>
						</div>
					{/if}
				</Card.Header>
				<Card.Content>
					{#if taskView === 'board' && t.kind === 'main'}
						<div class="-mx-2 mb-3 flex gap-3 overflow-x-auto px-2 pb-1">
							{#each data.columns as column (column.id)}
								{@const tasks = data.subtasks.filter((s) => s.columnId === column.id)}
								<div class="bg-muted/40 flex w-60 shrink-0 flex-col rounded-md p-2">
									<div class="mb-2 flex items-center justify-between gap-2 px-1 text-sm font-medium">
										<span class="truncate">{column.name}</span>
										<Badge variant="secondary">{tasks.length}</Badge>
									</div>
									<div class="flex flex-col gap-2">
										{#each tasks as s (s.id)}
											<div class="bg-card flex items-start gap-2 rounded-md border p-2 shadow-xs">
												<Checkbox
													disabled={!data.canEdit}
													checked={s.closed}
													onCheckedChange={() =>
														run(async () =>
															playIfCompleted(s.closed, await (s.closed ? reopenTicket(s.id) : closeTicket(s.id)))
														)}
													aria-label={m.done()}
												/>
												<a
													href={withBase(`/tickets/${s.key}`)}
													class={cn(
														'min-w-0 grow break-words text-sm hover:underline',
														s.closed && 'text-muted-foreground line-through'
													)}>{s.title}</a
												>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{:else if data.subtasks.length}
						<ul class="-mx-2 mb-3 flex flex-col">
							{#each data.subtasks as s (s.id)}
								<li class="hover:bg-muted flex items-center gap-2.5 rounded-md px-2 py-1.5">
									<Checkbox
										disabled={!data.canEdit}
										checked={s.closed}
										onCheckedChange={() =>
											run(async () =>
												playIfCompleted(s.closed, await (s.closed ? reopenTicket(s.id) : closeTicket(s.id)))
											)}
										aria-label={m.done()}
									/>
									<a
										href={withBase(`/tickets/${s.key}`)}
										class={cn('min-w-0 grow truncate', s.closed && 'text-muted-foreground line-through')}
									>
										{s.title}
									</a>
									{#if s.tags.length}
										<div class="flex shrink-0 flex-wrap justify-end gap-1">
											{#each s.tags as tag (tag.id)}<TagBadge name={tag.name} color={tag.color} />{/each}
										</div>
									{/if}
									{#if s.openBlockers > 0 && !s.closed}
										<Hint text={m.waiting_for_open_ticket_s({ value1: s.openBlockers })}>
											{#snippet children(props)}
												<span {...props} class="text-warning flex shrink-0 items-center gap-1 text-xs" data-blocked>
													<Ban class="size-3.5" />
													{s.openBlockers}
												</span>
											{/snippet}
										</Hint>
									{/if}
									<Badge variant="outline">{s.status}</Badge>
								</li>
							{/each}
						</ul>
					{/if}
					<form class="flex gap-2" onsubmit={addSubtask}>
						<Input
							disabled={!data.canEdit}
							placeholder={t.kind === 'version' ? m.new_main_task() : m.new_subtask()}
							bind:value={newSubtask}
						/>
						<Button disabled={!data.canEdit} type="submit" variant="outline"><Plus /> {m.add()}</Button>
					</form>
				</Card.Content>
			</Card.Root>

			<Attachments readOnly={!data.canEdit} ticketId={t.id} attachments={data.attachments} {refresh} />
			<TicketComments ticketId={t.id} comments={data.comments} canEdit={data.canEdit} {refresh} />
		</div>

		<!-- Seitenleiste: Eigenschaften und Verknüpfungen -->
		<div class="flex min-w-0 flex-col gap-4">
			<Card.Root class="gap-4 py-5">
				<Card.Content class="flex flex-col gap-4 px-5">
					<div class="grid gap-2">
						<Label>{m.element_type()}</Label>
						<Select.Root
							disabled={!data.canEdit || data.subtasks.length > 0}
							type="single"
							value={t.kind}
							onValueChange={(v) => patch({ kind: v as typeof t.kind, parentId: null })}
						>
							<Select.Trigger class="w-full"
								>{t.kind === 'version' ? m.version() : t.kind === 'main' ? m.main_task() : m.task()}</Select.Trigger
							>
							<Select.Content>
								<Select.Item value="version">{m.version()}</Select.Item>
								<Select.Item value="main">{m.main_task()}</Select.Item>
								<Select.Item value="task">{m.task()}</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
					{#if t.closed}
						<Button disabled={!data.canEdit} variant="outline" onclick={() => run(() => api('POST', `${base}/reopen`))}
							><RotateCcw /> {m.reopen()}</Button
						>
					{:else}
						<Button
							disabled={!data.canEdit}
							onclick={() => run(async () => playIfCompleted(t.closed, await closeTicket(t.id)))}
							><Check /> {m.complete()}</Button
						>
					{/if}

					<div class="grid gap-2">
						<Label>{m.status()}</Label>
						<Select.Root
							disabled={!data.canEdit}
							type="single"
							value={String(t.columnId)}
							onValueChange={(v) =>
								run(async () => playIfCompleted(t.closed, await updateTicket(t.id, { columnId: Number(v) })))}
						>
							<Select.Trigger aria-label={m.status()} class="w-full">{columnName}</Select.Trigger>
							<Select.Content>
								{#each data.columns as c (c.id)}<Select.Item value={String(c.id)}>{c.name}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="grid gap-2">
						<Label>{m.priority_2()}</Label>
						<Select.Root
							disabled={!data.canEdit}
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
						<Label>{m.tags()}</Label>
						<TagPicker
							disabled={!data.canEdit}
							tags={data.tags}
							value={t.tags.map((g) => g.id)}
							onchange={(tags) => patch({ tags })}
						/>
					</div>
					<div class="grid gap-2">
						<Label>{m.assignee()}</Label>
						<AssigneePicker
							assigned={data.assignees}
							disabled={!data.canEdit}
							users={data.users}
							me={page.data.user?.id}
							value={assigneeIds}
							onchange={(ids) => ((assigneeIds = ids), patch({ assignees: ids }))}
						/>
						{#if page.data.user && data.users.some((u) => u.id === page.data.user!.id) && !t.assigneeIds.includes(page.data.user.id)}
							<Button
								variant="link"
								size="xs"
								class="-mt-1 h-auto self-start px-0"
								onclick={() => patch({ assignees: [...t.assigneeIds, page.data.user!.id] })}
							>
								{m.assign_to_me()}
							</Button>
						{/if}
					</div>
					<div class="grid gap-2">
						<Label for="start">{m.start()}</Label>
						<DatePicker
							disabled={!data.canEdit}
							id="start"
							value={t.startDate}
							onchange={(d) => patch({ startDate: d })}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="due">{m.due()}</Label>
						<DatePicker
							disabled={!data.canEdit}
							id="due"
							value={t.dueDate}
							min={t.startDate}
							onchange={(d) => patch({ dueDate: d })}
						/>
						{#if data.canEdit && !t.startDate && t.dueDate}
							<Button
								variant="outline"
								size="sm"
								disabled={t.dueDate < today()}
								onclick={() => patch({ startDate: today() })}
							>
								{m.plan_from_today()}
							</Button>
							{#if t.dueDate < today()}<p class="text-muted-foreground text-xs">{m.plan_from_today_overdue()}</p>{/if}
						{/if}
					</div>
					{#if t.kind !== 'version'}<div class="grid gap-2">
							<Label>{t.kind === 'main' ? m.version() : m.main_task()}</Label>
							<Select.Root
								disabled={!data.canEdit}
								type="single"
								value={parentValue}
								onValueChange={(v) =>
									patch(
										v === 'tickets'
											? { parentId: null, boardGroup: 'tickets' }
											: { parentId: v ? Number(v) : null, ...(v ? {} : { boardGroup: 'general' }) }
									)}
							>
								<Select.Trigger class="w-full"><span class="truncate">{parentLabel}</span></Select.Trigger>
								<Select.Content class="max-h-72">
									{#if t.kind === 'task'}
										<Select.Item value="tickets">{m.ticket_system()}</Select.Item>
									{/if}
									<Select.Item value="">{t.kind === 'main' ? m.no_version() : m.no_main_task()}</Select.Item>
									{#if t.kind === 'task'}
										{#each parentGroups as group (group.key)}
											<Select.Group>
												<Select.GroupHeading
													class={cn(
														group.state === 'active' && 'text-primary font-semibold',
														group.state === 'done' && 'line-through'
													)}>{group.label}</Select.GroupHeading
												>
												{#each group.tasks as o (o.id)}
													<Select.Item value={String(o.id)}>
														<span
															class={cn(
																parentState(o) === 'active' && 'text-primary font-semibold',
																parentState(o) === 'done' && 'text-muted-foreground line-through'
															)}>{o.title}</span
														>
													</Select.Item>
												{/each}
											</Select.Group>
										{/each}
									{:else}
										{#each parentCandidates as o (o.id)}
											<Select.Item value={String(o.id)}>
												<span
													class={cn(
														parentState(o) === 'active' && 'text-primary font-semibold',
														parentState(o) === 'done' && 'text-muted-foreground line-through'
													)}>{o.title}</span
												>
											</Select.Item>
										{/each}
									{/if}
								</Select.Content>
							</Select.Root>
						</div>{/if}

					<Separator />
					<div class="text-muted-foreground flex flex-col gap-0.5 text-xs">
						{#if data.submission}
							<span class="flex items-center gap-1.5" data-submission>
								<Inbox class="size-3.5" />
								{data.submission.form ? m.submitted_via({ form: data.submission.form }) : m.submitted_via_form()}
							</span>
							{#if data.submission.email}
								<span>{m.submitted_by()}</span>
								<a class="text-primary hover:underline" href="mailto:{data.submission.email}">{data.submission.email}</a
								>
							{/if}
						{/if}
						<span>{m.created({ value1: new Date(t.createdAt).toLocaleString(intlLocale()) })}</span>
						<span>{m.updated({ value1: new Date(t.updatedAt).toLocaleString(intlLocale()) })}</span>
					</div>
					<Button disabled={!data.canEdit} variant="destructive" onclick={() => (confirmDelete = true)}
						><Trash2 /> {data.submission ? m.delete_submitted_ticket() : m.delete_ticket()}</Button
					>
				</Card.Content>
			</Card.Root>
			<Card.Root class="gap-4 py-5">
				<Card.Header class="flex items-center gap-2 px-5">
					<Link2 class="text-muted-foreground size-4" />
					<Card.Title class="grow">{m.links()}</Card.Title>
				</Card.Header>
				<Card.Content class="px-5">
					{#each groups as g (g.label)}
						{#if g.items.length}
							<div class="text-muted-foreground mt-1 mb-1 text-xs font-semibold tracking-wide uppercase">{g.label}</div>
							<ul class="-mx-2 mb-3 flex flex-col">
								{#each g.items as l (l.id)}
									<li class="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1">
										<a
											href={withBase(`/tickets/${l.ticket.key}`)}
											class={cn('min-w-0 grow truncate', l.ticket.closed && 'text-muted-foreground line-through')}
										>
											{l.ticket.title}
										</a>
										{#if l.ticket.closed}<Badge variant="secondary" class="text-success">{m.done_2()}</Badge>{/if}
										<Hint text={m.remove_link()}>
											{#snippet children(props)}
												<Button
													{...props}
													variant="ghost"
													size="icon-xs"
													class="hover:text-destructive"
													aria-label={m.remove_link()}
													onclick={() => run(() => api('DELETE', `${base}/links/${l.id}`))}><X /></Button
												>
											{/snippet}
										</Hint>
									</li>
								{/each}
							</ul>
						{/if}
					{/each}
					<form class="flex flex-col gap-2" onsubmit={addLink}>
						<Select.Root disabled={!data.canEdit} type="single" bind:value={linkType}>
							<Select.Trigger class="w-full">{LINK_TYPES[linkType]}</Select.Trigger>
							<Select.Content>
								{#each Object.entries(LINK_TYPES) as [v, l] (v)}
									<Select.Item value={v}>{l}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<TicketPicker disabled={!data.canEdit} class="w-full" tickets={linkCandidates} bind:value={linkTarget} />
						<Button disabled={!data.canEdit || !linkTarget} type="submit" variant="outline"><Link2 /> {m.link()}</Button
						>
					</form>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>{data.submission
					? m.delete_submitted_ticket_2({ value1: t.title })
					: m.delete_ticket_2({ value1: t.title })}</AlertDialog.Title
			>
			<AlertDialog.Description>
				{#if data.subtasks.length}
					{data.submission
						? m.the_submitted_ticket_and_its_subtask_s_will_be_permanently_deleted({ value1: data.subtasks.length })
						: m.the_ticket_and_its_subtask_s_will_be_permanently_deleted({ value1: data.subtasks.length })}
				{:else}
					{data.submission
						? m.the_submitted_ticket_will_be_permanently_deleted()
						: m.the_ticket_will_be_permanently_deleted()}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action class="bg-destructive hover:bg-destructive/90 text-white" onclick={remove}
				>{m.delete()}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
