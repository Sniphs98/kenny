<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import { updateUser } from '$lib/api';
	import type { ManagedUser, UpdateUserInput } from '$lib/contracts';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { toast } from 'svelte-sonner';
	let { data } = $props();
	let search = $state('');
	let busy = $state(false);
	let selected = $state<ManagedUser | null>(null);
	let confirmOpen = $state(false);
	const users = $derived(data.users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())));
	async function change(user: ManagedUser, input: UpdateUserInput) {
		busy = true;
		try {
			await updateUser(user.id, input);
			await invalidateAll();
			toast.success(m.um_user_updated());
		} catch (e) {
			toast.error((e as Error).message);
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{m.um_users()} · Kenny</title></svelte:head>
<div class="mx-auto max-w-6xl space-y-5 px-5 py-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.um_users()}</h1>
		<p class="text-muted-foreground mt-1 text-sm">{m.um_users_description()}</p>
	</div>
	<Input aria-label={m.um_search_users()} placeholder={m.um_search_users()} bind:value={search} class="max-w-sm" />
	<div class="overflow-x-auto rounded-xl border">
		<table class="w-full text-left text-sm">
			<thead class="bg-muted/50"
				><tr
					><th class="p-3">{m.name()}</th><th class="p-3">{m.email()}</th><th class="p-3">{m.um_sign_in_method()}</th
					><th class="p-3">{m.um_role()}</th><th class="p-3">{m.um_status()}</th><th class="p-3">{m.um_actions()}</th
					></tr
				></thead
			>
			<tbody
				>{#each users as user (user.id)}
					<tr class="border-t"
						><td class="p-3 font-medium">{user.name}</td><td class="p-3">{user.email}</td>
						<td class="p-3"
							>{user.providers
								.map((p) => (p === 'credential' ? m.um_password() : p === 'microsoft' ? 'Microsoft' : p))
								.join(', ') || '—'}</td
						>
						<td class="p-3"
							><select
								class="bg-background rounded-md border px-2 py-1"
								aria-label={`${m.um_role()} ${user.name}`}
								value={user.role}
								disabled={busy}
								onchange={(e) => change(user, { role: e.currentTarget.value === 'admin' ? 'admin' : 'user' })}
								><option value="user">{m.um_user()}</option><option value="admin">{m.um_admin()}</option></select
							></td
						>
						<td class="p-3"
							><Badge variant={user.active ? 'secondary' : 'outline'}
								>{user.active ? m.um_active() : m.um_disabled()}</Badge
							></td
						>
						<td class="p-3"
							><Button
								variant="outline"
								size="sm"
								disabled={busy}
								onclick={() => {
									if (user.active) {
										selected = user;
										confirmOpen = true;
									} else void change(user, { active: true });
								}}>{user.active ? m.um_deactivate() : m.um_reactivate()}</Button
							></td
						>
					</tr>
				{:else}<tr><td colspan="6" class="text-muted-foreground p-5">{m.um_no_users()}</td></tr>{/each}</tbody
			>
		</table>
	</div>
</div>
<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content
		><AlertDialog.Header
			><AlertDialog.Title>{m.um_deactivate_title()}</AlertDialog.Title><AlertDialog.Description
				>{m.um_deactivate_description({ name: selected?.name ?? '' })}</AlertDialog.Description
			></AlertDialog.Header
		>
		<AlertDialog.Footer
			><AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel><AlertDialog.Action
				onclick={() => {
					confirmOpen = false;
					if (selected) void change(selected, { active: false });
				}}>{m.um_deactivate()}</AlertDialog.Action
			></AlertDialog.Footer
		>
	</AlertDialog.Content>
</AlertDialog.Root>
