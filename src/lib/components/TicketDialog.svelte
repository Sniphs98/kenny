<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, PRIORITY_LABELS } from '$lib/api';

	type Option = { id: number | string; label: string };
	let {
		projectKey,
		users,
		parents
	}: { projectKey: string; users: { id: string; name: string }[]; parents: Option[] } = $props();

	let dialog: HTMLDialogElement;
	let form = $state(blank());
	let error = $state('');

	function blank() {
		return {
			title: '',
			description: '',
			priority: 'medium',
			assigneeId: '',
			startDate: '',
			dueDate: '',
			parentId: '' as string | number,
			columnId: undefined as number | undefined
		};
	}

	/** Dialog öffnen, optional mit Vorbelegung (z.B. Spalte oder Datum) */
	export function open(preset: Partial<ReturnType<typeof blank>> = {}) {
		form = { ...blank(), ...preset };
		error = '';
		dialog.showModal();
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await api('POST', `/projects/${projectKey}/tickets`, {
				...form,
				parentId: form.parentId || null,
				assigneeId: form.assigneeId || null
			});
			dialog.close();
			await invalidateAll();
		} catch (err) {
			error = (err as Error).message;
		}
	}
</script>

<dialog bind:this={dialog}>
	<form class="stack" onsubmit={submit}>
		<h2>Neues Ticket</h2>
		<label>Titel <input bind:value={form.title} required maxlength="300" /></label>
		<label>Beschreibung <textarea bind:value={form.description} rows="4"></textarea></label>
		<div class="row">
			<label class="grow">
				Priorität
				<select bind:value={form.priority}>
					{#each Object.entries(PRIORITY_LABELS) as [v, l]}<option value={v}>{l}</option>{/each}
				</select>
			</label>
			<label class="grow">
				Zuständig
				<select bind:value={form.assigneeId}>
					<option value="">Niemand</option>
					{#each users as u}<option value={u.id}>{u.name}</option>{/each}
				</select>
			</label>
		</div>
		<div class="row">
			<label class="grow">Start <input type="date" bind:value={form.startDate} /></label>
			<label class="grow">Fällig <input type="date" bind:value={form.dueDate} /></label>
		</div>
		<label>
			Unteraufgabe von
			<select bind:value={form.parentId}>
				<option value="">Keinem Ticket</option>
				{#each parents as p}<option value={p.id}>{p.label}</option>{/each}
			</select>
		</label>
		{#if error}<p class="error">{error}</p>{/if}
		<div class="row" style="justify-content: flex-end">
			<button type="button" onclick={() => dialog.close()}>Abbrechen</button>
			<button class="primary">Anlegen</button>
		</div>
	</form>
</dialog>
