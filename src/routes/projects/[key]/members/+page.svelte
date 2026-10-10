<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import { addProjectMember, changeProjectMember } from '$lib/api';
	import { PROJECT_ROLES, type ProjectRole } from '$lib/contracts';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { toast } from 'svelte-sonner';
	let { data } = $props();
	let email = $state('');
	let role = $state<ProjectRole>('member');
	let busy = $state(false);
	let selected = $state<string | null>(null);
	let confirmOpen = $state(false);
	const label = (value: ProjectRole) =>
		value === 'admin' ? m.um_project_admin() : value === 'member' ? m.um_member() : m.um_reader();
	async function run(fn: () => Promise<unknown>) {
		busy = true;
		try {
			await fn();
			await invalidateAll();
			toast.success(m.um_members_updated());
		} catch (e) {
			toast.error((e as Error).message);
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
	async function add(e: SubmitEvent) {
		e.preventDefault();
		await run(async () => {
			await addProjectMember(data.project.key, { user: email, role });
			email = '';
		});
	}
</script>

<svelte:head><title>{m.um_members()} · {data.project.name} · Kenny</title></svelte:head>
<div class="mx-auto max-w-4xl space-y-5 px-5 py-6">
	<div>
		<h2 class="text-xl font-semibold">{m.um_members()}</h2>
		<p class="text-muted-foreground mt-1 text-sm">{m.um_members_description()}</p>
	</div>
	<form onsubmit={add} class="flex flex-wrap items-end gap-3 rounded-xl border p-4">
		<div class="min-w-0 basis-56 flex-1 space-y-2">
			<Label for="member-email">{m.email()}</Label><Input id="member-email" type="email" required bind:value={email} />
		</div>
		<div class="space-y-2">
			<Label for="member-role">{m.um_role()}</Label><select
				id="member-role"
				bind:value={role}
				class="bg-background h-9 rounded-md border px-3"
				>{#each PROJECT_ROLES as value (value)}<option {value}>{label(value)}</option>{/each}</select
			>
		</div>
		<Button type="submit" disabled={busy}>{m.um_add_member()}</Button>
	</form>
	<p class="text-muted-foreground text-sm">{m.um_roles_description()}</p>
	<div class="overflow-x-auto rounded-xl border">
		<table class="w-full text-left text-sm">
			<thead class="bg-muted/50"
				><tr
					><th class="p-3">{m.name()}</th><th class="p-3">{m.email()}</th><th class="p-3">{m.um_role()}</th><th
						class="p-3">{m.um_actions()}</th
					></tr
				></thead
			>
			<tbody
				>{#each data.members as member (member.id)}<tr class="border-t"
						><td class="p-3 font-medium"
							>{member.name}
							{#if !member.active}<Badge variant="outline">{m.um_disabled()}</Badge>{/if}</td
						><td class="p-3">{member.email}</td>
						<td class="p-3"
							><select
								class="bg-background rounded-md border px-2 py-1"
								aria-label={`${m.um_role()} ${member.name}`}
								value={member.role}
								disabled={busy}
								onchange={(e) => {
									const value = PROJECT_ROLES.find((r) => r === e.currentTarget.value);
									if (value) void run(() => changeProjectMember(data.project.key, member.id, value));
								}}
								>{#each PROJECT_ROLES as value (value)}<option {value}>{label(value)}</option>{/each}</select
							></td
						>
						<td class="p-3"
							><Button
								variant="outline"
								size="sm"
								disabled={busy}
								onclick={() => {
									selected = member.id;
									confirmOpen = true;
								}}>{m.um_remove()}</Button
							></td
						>
					</tr>{/each}</tbody
			>
		</table>
	</div>
</div>
<AlertDialog.Root bind:open={confirmOpen}
	><AlertDialog.Content
		><AlertDialog.Header
			><AlertDialog.Title>{m.um_remove_member_title()}</AlertDialog.Title><AlertDialog.Description
				>{m.um_remove_member_description()}</AlertDialog.Description
			></AlertDialog.Header
		><AlertDialog.Footer
			><AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel><AlertDialog.Action
				onclick={() => {
					confirmOpen = false;
					const id = selected;
					if (id) void run(() => changeProjectMember(data.project.key, id, null));
				}}>{m.um_remove()}</AlertDialog.Action
			></AlertDialog.Footer
		></AlertDialog.Content
	></AlertDialog.Root
>
