<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { buttonVariants } from '$lib/components/ui/button';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { cn } from '$lib/utils';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import UserRoundX from '@lucide/svelte/icons/user-round-x';

	type User = { id: string; name: string; email?: string };

	let {
		users,
		value,
		onchange,
		me,
		compact = false,
		class: className
	}: {
		users: User[];
		value: string | null;
		onchange: (id: string | null) => void;
		/** ID des angemeldeten Benutzers, für „Mir zuweisen“ */
		me?: string;
		/** Nur den Avatar als Auslöser zeigen (z.B. auf Board-Karten) */
		compact?: boolean;
		class?: string;
	} = $props();

	let open = $state(false);
	const current = $derived(users.find((u) => u.id === value) ?? null);
	// Angemeldeten Benutzer zuerst
	const sorted = $derived([...users].sort((a, b) => Number(b.id === me) - Number(a.id === me) || a.name.localeCompare(b.name)));

	function pick(id: string | null) {
		open = false;
		if (id !== value) onchange(id);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class={cn(
			compact
				? 'focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-3'
				: buttonVariants({ variant: 'outline', class: 'w-full justify-between font-normal' }),
			className
		)}
		title={current ? `Zuständig: ${current.name}` : 'Niemandem zugewiesen'}
		onclick={(e) => e.stopPropagation()}
	>
		{#if compact}
			<UserAvatar name={current?.name} size="sm" />
		{:else}
			<span class="flex min-w-0 items-center gap-2">
				<UserAvatar name={current?.name} size="sm" />
				<span class={cn('truncate', !current && 'text-muted-foreground')}>{current?.name ?? 'Niemand'}</span>
			</span>
			<ChevronsUpDown class="text-muted-foreground" />
		{/if}
	</Popover.Trigger>
	<Popover.Content class="w-64 p-0" align={compact ? 'end' : 'start'} onclick={(e) => e.stopPropagation()}>
		<Command.Root>
			<Command.Input placeholder="Benutzer suchen…" />
			<Command.List>
				<Command.Empty>Kein Benutzer gefunden.</Command.Empty>
				<Command.Group>
					<Command.Item value="__none" keywords={['niemand', 'keiner']} onSelect={() => pick(null)}>
						<UserRoundX class="text-muted-foreground" />
						<span class="grow">Niemand</span>
						{#if !value}<Check />{/if}
					</Command.Item>
					{#each sorted as u (u.id)}
						<Command.Item value={u.id} keywords={[u.name, u.email ?? '']} onSelect={() => pick(u.id)}>
							<UserAvatar name={u.name} size="sm" />
							<span class="grow truncate">{u.name}{#if u.id === me}<span class="text-muted-foreground"> (ich)</span>{/if}</span>
							{#if u.id === value}<Check />{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
