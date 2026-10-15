<script lang="ts">
	import { localizeError } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { ticketFormSchema, type Priority, type TicketKind } from '#lib/contracts/index.js';
	import { createTicket, PRIORITY_LABELS } from '#lib/api.js';
	import AssigneePicker from '#lib/components/AssigneePicker.svelte';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import BucketPicker from '#lib/components/BucketPicker.svelte';
	import { newTicketRequest, takeNewTicketRequest } from '#lib/new-ticket.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';

	type Option = { id: number | string; label: string; kind: TicketKind };
	let {
		projectKey,
		users,
		tags,
		buckets = [],
		parents,
		canCreate = true,
		canManage = false,
		preset = () => ({})
	}: {
		projectKey: string;
		users: { id: string; name: string; email?: string }[];
		tags: { id: number; name: string; color: string }[];
		buckets?: { id: number; name: string }[];
		parents: Option[];
		/** Ohne Schreibrechte öffnet die Befehlspalette den Dialog nicht */
		canCreate?: boolean;
		canManage?: boolean;
		/** Vorbelegung beim Öffnen aus der Befehlspalette (z.B. Datum im Gantt) */
		preset?: () => Partial<ReturnType<typeof blank>>;
	} = $props();

	/** Nach dem Anlegen offen bleiben, um viele Tickets nacheinander zu erfassen (pro Browser gemerkt) */
	const CREATE_MORE_KEY = 'kenny:create-more';
	let createMore = $state(false);
	try {
		createMore = typeof localStorage !== 'undefined' && localStorage.getItem(CREATE_MORE_KEY) === '1';
	} catch {
		// Speicher gesperrt: Standard bleibt aus
	}
	function setCreateMore(on: boolean) {
		createMore = on;
		try {
			localStorage.setItem(CREATE_MORE_KEY, on ? '1' : '0');
		} catch {
			// nicht speicherbar, gilt dann nur für diese Seite
		}
	}
	let createdAnother = false;

	let isOpen = $state(false);
	const { form, errors, enhance, reset, submitting } = superForm(blank(), {
		SPA: true,
		dataType: 'json',
		// Schnelles Enter legt kein Ticket doppelt an; Felder bleiben für „Weitere erstellen“ erhalten
		multipleSubmits: 'prevent',
		resetForm: false,
		validationMethod: 'onsubmit',
		validators: zod4Client(ticketFormSchema),
		async onUpdate({ form: validated }) {
			if (!validated.valid) return;
			error = '';
			try {
				const created = await createTicket(projectKey, {
					...validated.data,
					startDate: validated.data.startDate || null,
					dueDate: validated.data.dueDate || null,
					parentId: validated.data.parentId ? Number(validated.data.parentId) : null
				});
				if (createMore) {
					// Titel und Beschreibung leeren, Priorität, Zuständigkeit, Tags, Spalte usw. behalten
					validated.data.title = '';
					validated.data.description = '';
					createdAnother = true;
					toast.success(m.ticket_created({ key: created.key }));
				} else {
					isOpen = false;
				}
				await refreshAll();
			} catch (err) {
				error = err instanceof Error ? err.message : m.could_not_create_ticket();
			}
		},
		onUpdated() {
			if (!createdAnother) return;
			createdAnother = false;
			document.getElementById('t-title')?.focus();
		}
	});
	let error = $state('');

	function blank() {
		return {
			title: '',
			kind: 'task' as TicketKind,
			description: '',
			priority: 'medium' as Priority,
			assignees: [] as string[],
			tags: [] as (number | string)[],
			bucketId: null as number | null,
			startDate: '',
			dueDate: '',
			parentId: '',
			columnId: undefined as number | undefined
		};
	}

	/** Dialog öffnen, optional mit Vorbelegung (z.B. Spalte oder Datum) */
	export function open(preset: Partial<ReturnType<typeof blank>> = {}) {
		reset({ data: { ...blank(), ...preset } });
		error = '';
		isOpen = true;
	}

	// „Neues Ticket“ aus der Befehlspalette (Strg+K)
	$effect(() => {
		if (newTicketRequest.pending && canCreate && takeNewTicketRequest()) open(preset());
	});

	const parentOptions = $derived(parents.filter((p) => p.kind === ($form.kind === 'task' ? 'main' : 'version')));
	const emptyParentLabel = $derived($form.kind === 'main' ? m.no_version() : m.no_main_task());
	const parentLabel = $derived(parentOptions.find((p) => String(p.id) === $form.parentId)?.label ?? emptyParentLabel);
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" method="POST" use:enhance>
			<Dialog.Header>
				<Dialog.Title>{m.new_ticket()}</Dialog.Title>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="t-title">{m.title()}</Label>
				<Input id="t-title" bind:value={$form.title} required maxlength={300} />
			</div>
			<div class="grid gap-2">
				<Label>{m.element_type()}</Label>
				<Select.Root type="single" value={$form.kind} onValueChange={(v) => { $form.kind = v as TicketKind; $form.parentId = ''; }}>
					<Select.Trigger class="w-full">{$form.kind === 'version' ? m.version() : $form.kind === 'main' ? m.main_task() : m.task()}</Select.Trigger>
					<Select.Content>
						<Select.Item value="version">{m.version()}</Select.Item>
						<Select.Item value="main">{m.main_task()}</Select.Item>
						<Select.Item value="task">{m.task()}</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-2">
				<Label for="t-desc">{m.description()}</Label>
				<Textarea id="t-desc" bind:value={$form.description} rows={4} />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label>{m.priority_2()}</Label>
					<Select.Root type="single" bind:value={$form.priority}>
						<Select.Trigger class="w-full">
							<span class="flex items-center gap-2"
								><span class="prio prio-{$form.priority}"></span>{PRIORITY_LABELS[$form.priority]}</span
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
					<Label>{m.assignee()}</Label>
					<AssigneePicker
						{users}
						me={page.data.user?.id}
						value={$form.assignees}
						onchange={(ids) => ($form.assignees = ids)}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="t-start">{m.start()}</Label>
					<DatePicker id="t-start" value={$form.startDate || null} onchange={(d) => ($form.startDate = d ?? '')} />
				</div>
				<div class="grid gap-2">
					<Label for="t-due">{m.due()}</Label>
					<DatePicker
						id="t-due"
						value={$form.dueDate || null}
						min={$form.startDate}
						onchange={(d) => ($form.dueDate = d ?? '')}
					/>
				</div>
			</div>
			<div class="grid gap-2">
				<Label>{m.bucket()}</Label>
				<BucketPicker
					project={projectKey}
					{buckets}
					value={$form.bucketId}
					{canManage}
					onchange={(id) => {
						$form.bucketId = id;
					}}
				/>
				<Label>{m.tags()}</Label>
				<TagPicker {tags} value={$form.tags} onchange={(refs) => ($form.tags = refs)} />
			</div>
			{#if $form.kind !== 'version'}<div class="grid gap-2">
				<Label>{$form.kind === 'main' ? m.version() : m.main_task()}</Label>
				<Select.Root type="single" bind:value={$form.parentId}>
					<Select.Trigger class="w-full"><span class="truncate">{parentLabel}</span></Select.Trigger>
					<Select.Content class="max-h-72">
						<Select.Item value="">{emptyParentLabel}</Select.Item>
						{#each parentOptions as p (p.id)}
							<Select.Item value={String(p.id)}>{p.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>{/if}
			{#each Object.values($errors)
				.flat()
				.filter((value): value is string => typeof value === 'string') as validationError, i (i)}<p
					class="text-destructive text-sm"
					role="alert"
				>
					{localizeError(validationError)}
				</p>{/each}
			{#if error}<p class="text-destructive text-sm">{localizeError(error)}</p>{/if}
			<Dialog.Footer class="items-center">
				<Label class="mr-auto font-normal max-sm:order-last max-sm:mx-auto">
					<Checkbox checked={createMore} onCheckedChange={setCreateMore} />
					{m.create_more()}
				</Label>
				<Button variant="outline" onclick={() => (isOpen = false)}>{m.cancel()}</Button>
				<Button type="submit" disabled={$submitting}>{m.create()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
