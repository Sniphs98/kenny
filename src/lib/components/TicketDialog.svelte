<script lang="ts">
	import { localizeError } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { ticketFormSchema, type Priority } from '$lib/contracts';
	import { createTicket, PRIORITY_LABELS } from '$lib/api';
	import AssigneePicker from '$lib/components/AssigneePicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';

	type Option = { id: number | string; label: string };
	let {
		projectKey,
		users,
		tags,
		parents
	}: {
		projectKey: string;
		users: { id: string; name: string; email?: string }[];
		tags: { id: number; name: string; color: string }[];
		parents: Option[];
	} = $props();

	let isOpen = $state(false);
	const { form, errors, enhance, reset, submitting } = superForm(blank(), {
		SPA: true,
		dataType: 'json',
		validationMethod: 'onsubmit',
		validators: zod4Client(ticketFormSchema),
		async onUpdate({ form: validated }) {
			if (!validated.valid) return;
			error = '';
			try {
				await createTicket(projectKey, {
					...validated.data,
					startDate: validated.data.startDate || null,
					dueDate: validated.data.dueDate || null,
					parentId: validated.data.parentId ? Number(validated.data.parentId) : null
				});
				isOpen = false;
				await invalidateAll();
			} catch (err) {
				error = err instanceof Error ? err.message : m.could_not_create_ticket();
			}
		}
	});
	let error = $state('');

	function blank() {
		return {
			title: '',
			description: '',
			priority: 'medium' as Priority,
			assigneeId: null as string | null,
			tags: [] as (number | string)[],
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

	const parentLabel = $derived(parents.find((p) => String(p.id) === $form.parentId)?.label ?? m.no_parent_ticket());
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
						value={$form.assigneeId}
						onchange={(id) => ($form.assigneeId = id)}
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
				<Label>{m.tags()}</Label>
				<TagPicker {tags} value={$form.tags} onchange={(refs) => ($form.tags = refs)} />
			</div>
			<div class="grid gap-2">
				<Label>{m.subtask_of_2()}</Label>
				<Select.Root type="single" bind:value={$form.parentId}>
					<Select.Trigger class="w-full"><span class="truncate">{parentLabel}</span></Select.Trigger>
					<Select.Content class="max-h-72">
						<Select.Item value="">{m.no_parent_ticket()}</Select.Item>
						{#each parents as p (p.id)}
							<Select.Item value={String(p.id)}>{p.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			{#each Object.values($errors)
				.flat()
				.filter((value): value is string => typeof value === 'string') as validationError, i (i)}<p
					class="text-destructive text-sm"
					role="alert"
				>
					{localizeError(validationError)}
				</p>{/each}
			{#if error}<p class="text-destructive text-sm">{localizeError(error)}</p>{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (isOpen = false)}>{m.cancel()}</Button>
				<Button type="submit" disabled={$submitting}>{m.create()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
