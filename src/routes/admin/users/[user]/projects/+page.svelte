<script lang="ts">
	import { withBase } from '#lib/paths.js';
	import { refreshAll } from '$app/navigation';
	import { m } from '#lib/paraglide/messages.js';
	import { assignUserProject, changeUserProject } from '#lib/api.js';
	import { assignUserProjectSchema, PROJECT_ROLES, type ProjectRole, type UserProject } from '#lib/contracts/index.js';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { toast } from 'svelte-sonner';
	let { data } = $props();
	let search = $state('');
	let busy = $state(false);
	let selected = $state<UserProject | null>(null);
	let confirmOpen = $state(false);
	const label = (role: ProjectRole) =>
		role === 'admin' ? m.um_project_admin() : role === 'member' ? m.um_member() : m.um_reader();
	const available = $derived(
		data.projects.filter((p) => !data.memberships.some((membership) => membership.projectId === p.id))
	);
	const { form, errors, enhance, submitting } = superForm(
		{ projectId: 0, role: 'member' as ProjectRole },
		{
			SPA: true,
			dataType: 'json',
			validators: zod4Client(assignUserProjectSchema),
			multipleSubmits: 'prevent',
			resetForm: false,
			async onUpdate({ form: validated }) {
				if (!validated.valid) return;
				await run(async () => {
					await assignUserProject(data.managedUser.id, validated.data);
					validated.data.projectId = 0;
					$form.projectId = 0;
					search = '';
				});
			}
		}
	);
	const choices = $derived(
		available.filter(
			(p) => p.id === $form.projectId || `${p.key} ${p.name}`.toLowerCase().includes(search.trim().toLowerCase())
		)
	);
	async function run(action: () => Promise<unknown>) {
		busy = true;
		try {
			await action();
			await refreshAll();
			toast.success(m.um_members_updated());
		} catch (e) {
			toast.error((e as Error).message);
			await refreshAll();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{m.um_user_projects()} · {data.managedUser.name} · Kenny</title></svelte:head>
<div class="mx-auto max-w-4xl space-y-5 px-5 py-6">
	<a href={withBase('/admin/users')} class="text-primary text-sm underline">{m.um_back_to_users()}</a>
	<div>
		<h1 class="text-2xl font-semibold">{m.um_projects_for_user({ name: data.managedUser.name })}</h1>
		<p class="text-muted-foreground mt-1 text-sm">{data.managedUser.email}</p>
	</div>
	{#if data.managedUser.role === 'admin'}<p class="text-muted-foreground text-sm">
			{m.um_global_project_access()}
		</p>{/if}
	{#if !data.managedUser.active}<p class="text-muted-foreground text-sm">{m.um_reactivate_before_assigning()}</p>{/if}
	<form method="POST" use:enhance class="grid gap-3 rounded-xl border p-4">
		<label
			>{m.um_search_projects()}<Input
				bind:value={search}
				disabled={busy || $submitting || !data.managedUser.active}
			/></label
		>
		<label
			>{m.um_choose_project()}<select
				aria-label={m.um_choose_project()}
				class="bg-background h-9 w-full rounded-md border px-3"
				bind:value={$form.projectId}
				disabled={busy || $submitting || !data.managedUser.active || !available.length}
				><option value={0}>{m.um_choose_project_placeholder()}</option>{#each choices as p (p.id)}<option value={p.id}
						>{p.key} — {p.name}</option
					>{/each}</select
			></label
		>
		{#if $errors.projectId}<p class="text-destructive text-sm">{$errors.projectId}</p>{/if}
		<label
			>{m.um_role()}<select
				aria-label={m.um_role()}
				class="bg-background h-9 w-full rounded-md border px-3"
				bind:value={$form.role}
				disabled={busy || $submitting || !data.managedUser.active}
				>{#each PROJECT_ROLES as role (role)}<option value={role}>{label(role)}</option>{/each}</select
			></label
		>
		<Button type="submit" disabled={busy || $submitting || !data.managedUser.active || !available.length}
			>{m.um_assign_project()}</Button
		>
	</form>
	<div class="overflow-x-auto rounded-xl border">
		<table class="w-full text-left text-sm">
			<thead class="bg-muted/50"
				><tr
					><th class="p-3">{m.project()}</th><th class="p-3">{m.um_role()}</th><th class="p-3">{m.um_actions()}</th></tr
				></thead
			>
			<tbody
				>{#each data.memberships as membership (membership.projectId)}
					<tr class="border-t"
						><td class="p-3"
							><a class="text-primary underline" href={withBase(`/projects/${membership.key}/board`)}
								>{membership.key} — {membership.name}</a
							></td
						>
						<td class="p-3"
							><select
								aria-label={`${m.um_role()} ${membership.name}`}
								class="bg-background rounded-md border px-2 py-1"
								value={membership.role}
								disabled={busy || $submitting}
								onchange={(e) => {
									const role = PROJECT_ROLES.find((r) => r === e.currentTarget.value);
									if (role) void run(() => changeUserProject(data.managedUser.id, membership.projectId, role));
								}}
								>{#each PROJECT_ROLES as role (role)}<option value={role}>{label(role)}</option>{/each}</select
							></td
						>
						<td class="p-3"
							><Button
								variant="outline"
								disabled={busy || $submitting}
								onclick={() => {
									selected = membership;
									confirmOpen = true;
								}}>{m.um_remove()}</Button
							></td
						></tr
					>
				{:else}<tr><td colspan="3" class="text-muted-foreground p-5">{m.um_no_user_projects()}</td></tr>{/each}</tbody
			>
		</table>
	</div>
</div>
<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content
		><AlertDialog.Header
			><AlertDialog.Title>{m.um_remove_user_project()}</AlertDialog.Title><AlertDialog.Description
				>{m.um_remove_user_project_description({ name: selected?.name ?? '' })}</AlertDialog.Description
			></AlertDialog.Header
		><AlertDialog.Footer
			><AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel><AlertDialog.Action
				onclick={() => {
					const projectId = selected?.projectId;
					confirmOpen = false;
					if (projectId) void run(() => changeUserProject(data.managedUser.id, projectId, null));
				}}>{m.um_remove()}</AlertDialog.Action
			></AlertDialog.Footer
		></AlertDialog.Content
	>
</AlertDialog.Root>
