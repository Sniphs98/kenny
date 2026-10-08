<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api, PRIORITY_LABELS } from '$lib/api';
	import AssigneePicker from '$lib/components/AssigneePicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
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
		parents
	}: { projectKey: string; users: { id: string; name: string; email?: string }[]; parents: Option[] } = $props();

	let isOpen = $state(false);
	let form = $state(blank());
	let error = $state('');

	function blank() {
		return {
			title: '',
			description: '',
			priority: 'medium',
			assigneeId: null as string | null,
			startDate: '',
			dueDate: '',
			parentId: '',
			columnId: undefined as number | undefined
		};
	}

	/** Dialog öffnen, optional mit Vorbelegung (z.B. Spalte oder Datum) */
	export function open(preset: Partial<ReturnType<typeof blank>> = {}) {
		form = { ...blank(), ...preset };
		error = '';
		isOpen = true;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await api('POST', `/projects/${projectKey}/tickets`, {
				...form,
				startDate: form.startDate || null,
				dueDate: form.dueDate || null,
				parentId: form.parentId ? Number(form.parentId) : null
			});
			isOpen = false;
			await invalidateAll();
		} catch (err) {
			error = (err as Error).message;
		}
	}

	const parentLabel = $derived(parents.find((p) => String(p.id) === form.parentId)?.label ?? 'Keinem Ticket');
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Neues Ticket</Dialog.Title>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="t-title">Titel</Label>
				<Input id="t-title" bind:value={form.title} required maxlength={300} />
			</div>
			<div class="grid gap-2">
				<Label for="t-desc">Beschreibung</Label>
				<Textarea id="t-desc" bind:value={form.description} rows={4} />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label>Priorität</Label>
					<Select.Root type="single" bind:value={form.priority}>
						<Select.Trigger class="w-full">
							<span class="flex items-center gap-2"><span class="prio prio-{form.priority}"></span>{PRIORITY_LABELS[form.priority]}</span>
						</Select.Trigger>
						<Select.Content>
							{#each Object.entries(PRIORITY_LABELS) as [v, l] (v)}
								<Select.Item value={v}><span class="prio prio-{v}"></span>{l}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-2">
					<Label>Zuständig</Label>
					<AssigneePicker {users} me={page.data.user?.id} value={form.assigneeId} onchange={(id) => (form.assigneeId = id)} />
				</div>
				<div class="grid gap-2">
					<Label for="t-start">Start</Label>
					<DatePicker id="t-start" value={form.startDate || null} onchange={(d) => (form.startDate = d ?? '')} />
				</div>
				<div class="grid gap-2">
					<Label for="t-due">Fällig</Label>
					<DatePicker id="t-due" value={form.dueDate || null} min={form.startDate} onchange={(d) => (form.dueDate = d ?? '')} />
				</div>
			</div>
			<div class="grid gap-2">
				<Label>Unteraufgabe von</Label>
				<Select.Root type="single" bind:value={form.parentId}>
					<Select.Trigger class="w-full"><span class="truncate">{parentLabel}</span></Select.Trigger>
					<Select.Content class="max-h-72">
						<Select.Item value="">Keinem Ticket</Select.Item>
						{#each parents as p (p.id)}
							<Select.Item value={String(p.id)}>{p.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			{#if error}<p class="text-destructive text-sm">{error}</p>{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (isOpen = false)}>Abbrechen</Button>
				<Button type="submit">Anlegen</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
