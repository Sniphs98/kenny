<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import Hint from '#lib/components/Hint.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import { cn } from '#lib/utils.js';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import UserRoundX from '@lucide/svelte/icons/user-round-x';

	type User = { id: string; name: string; email?: string };

	let {
		users,
		value,
		assigned = [],
		onchange,
		me,
		compact = false,
		disabled = false,
		class: className
	}: {
		users: User[];
		/** IDs der Zuständigen in ihrer Reihenfolge */
		value: string[];
		/** Namen der Zuständigen, auch wenn sie nicht mehr auswählbar sind (z. B. deaktiviert) */
		assigned?: { id: string; name: string }[];
		onchange: (ids: string[]) => void;
		/** ID des angemeldeten Benutzers, für „Mir zuweisen“ */
		me?: string;
		/** Nur die Avatare als Auslöser zeigen (z.B. auf Board-Karten) */
		compact?: boolean;
		disabled?: boolean;
		class?: string;
	} = $props();

	let open = $state(false);
	const current = $derived(
		value.map((id) => users.find((u) => u.id === id) ?? assigned.find((a) => a.id === id)).filter((u): u is User => !!u)
	);
	const names = $derived(current.map((u) => u.name).join(', '));
	const label = $derived(current.length ? m.assignee_2({ value1: names }) : m.unassigned_3());
	// Angemeldeten Benutzer zuerst
	const sorted = $derived(
		[...users].sort((a, b) => Number(b.id === me) - Number(a.id === me) || a.name.localeCompare(b.name))
	);
	/** Im kompakten Auslöser höchstens so viele Avatare, der Rest als „+n“ */
	const SHOWN = 3;

	/** Auswahl umschalten; die Liste bleibt offen, damit mehrere Personen gewählt werden können */
	function toggle(id: string) {
		onchange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
	}

	function clear() {
		open = false;
		if (value.length) onchange([]);
	}
</script>

<Popover.Root bind:open>
	<!-- Tooltip nur in der kompakten Form; sonst stehen die Namen schon im Button -->
	<Hint text={compact ? label : null}>
		{#snippet children(props)}
			<Popover.Trigger
				{disabled}
				{...props}
				class={cn(
					compact
						? 'focus-visible:ring-ring/50 flex items-center rounded-full outline-none focus-visible:ring-3'
						: buttonVariants({ variant: 'outline', class: 'h-auto min-h-9 w-full justify-between font-normal' }),
					className
				)}
				aria-label={label}
				onclick={(e) => e.stopPropagation()}
			>
				{#if compact}
					{#if current.length}
						<span class="flex -space-x-1.5">
							{#each current.slice(0, SHOWN) as u (u.id)}
								<UserAvatar name={u.name} size="sm" tooltip={false} class="ring-card ring-2" />
							{/each}
						</span>
						{#if current.length > SHOWN}
							<span class="text-muted-foreground ml-1 text-xs tabular-nums">+{current.length - SHOWN}</span>
						{/if}
					{:else}
						<UserAvatar name={null} size="sm" tooltip={false} />
					{/if}
				{:else}
					<span class="flex min-w-0 items-center gap-2">
						{#if current.length}
							<span class="flex shrink-0 -space-x-1.5">
								{#each current.slice(0, SHOWN) as u (u.id)}
									<UserAvatar name={u.name} size="sm" tooltip={false} class="ring-background ring-2" />
								{/each}
							</span>
							<span class="truncate">{names}</span>
						{:else}
							<UserAvatar name={null} size="sm" tooltip={false} />
							<span class="text-muted-foreground truncate">{m.nobody()}</span>
						{/if}
					</span>
					<ChevronsUpDown class="text-muted-foreground" />
				{/if}
			</Popover.Trigger>
		{/snippet}
	</Hint>
	<Popover.Content class="w-64 p-0" align={compact ? 'end' : 'start'} onclick={(e) => e.stopPropagation()}>
		<Command.Root>
			<Command.Input placeholder={m.search_users()} />
			<Command.List>
				<Command.Empty>{m.no_users_found()}</Command.Empty>
				<Command.Group>
					<Command.Item value="__none" keywords={['niemand', 'keiner', 'nobody']} onSelect={clear}>
						<UserRoundX class="text-muted-foreground" />
						<span class="grow">{m.nobody()}</span>
						{#if !value.length}<Check />{/if}
					</Command.Item>
					{#each sorted as u (u.id)}
						<Command.Item value={u.id} keywords={[u.name, u.email ?? '']} onSelect={() => toggle(u.id)}>
							<UserAvatar name={u.name} size="sm" />
							<span class="grow truncate"
								>{u.name}{#if u.id === me}<span class="text-muted-foreground"> {m.me()}</span>{/if}</span
							>
							{#if value.includes(u.id)}<Check />{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
