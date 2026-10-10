<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { listProjects, searchTickets } from '$lib/api';
	import type { TicketListItem } from '$lib/contracts';
	import { requestNewTicket } from '$lib/new-ticket.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import * as Command from '$lib/components/ui/command';
	import { cn } from '$lib/utils';
	import { setMode } from 'mode-watcher';
	import type { Component } from 'svelte';
	import ChartGantt from '@lucide/svelte/icons/chart-gantt';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import Inbox from '@lucide/svelte/icons/inbox';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Sun from '@lucide/svelte/icons/sun';
	import Users from '@lucide/svelte/icons/users';

	/** Befehlspalette (Strg+K / ⌘K): Tickets suchen, Aktionen ausführen, schnell navigieren */
	let open = $state(false);
	let query = $state('');
	let tickets = $state<TicketListItem[]>([]);
	/** Markierter Eintrag; neue Treffer markieren den besten, damit Enter das Ticket öffnet */
	let selected = $state('');
	let searching = $state(false);
	let projects = $state<{ key: string; name: string; color: string }[]>([]);

	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const shortcutLabel = mac ? '⌘K' : m.command_shortcut_ctrl();

	type Action = { id: string; label: string; icon: Component; run: () => unknown; hint?: string };

	const current = $derived(
		page.data as { project?: { key: string; name: string }; canEdit?: boolean; user?: { role?: string } | null }
	);
	const isAdmin = $derived(current.user?.role === 'admin');

	/** Neues Ticket: auf Board/Gantt sofort, sonst zuerst zum Board des Projekts */
	async function newTicket(key: string) {
		const here = page.url.pathname;
		if (here !== `/projects/${key}/board` && here !== `/projects/${key}/gantt`) await goto(`/projects/${key}/board`);
		requestNewTicket();
	}

	const actions = $derived.by((): Action[] => {
		const p = current.project;
		return [
			...(p && current.canEdit
				? [
						{
							id: 'new-ticket',
							label: m.command_new_ticket({ project: p.name }),
							icon: Plus,
							run: () => newTicket(p.key)
						}
					]
				: [])
		];
	});

	const navigation = $derived.by((): Action[] => {
		const p = current.project;
		return [
			...(p
				? [
						{
							id: 'board',
							label: `${p.name}: ${m.board()}`,
							icon: SquareKanban,
							run: () => goto(`/projects/${p.key}/board`)
						},
						{
							id: 'gantt',
							label: `${p.name}: ${m.gantt()}`,
							icon: ChartGantt,
							run: () => goto(`/projects/${p.key}/gantt`)
						}
					]
				: []),
			{ id: 'projects', label: m.projects(), icon: FolderKanban, run: () => goto('/') },
			...projects
				.filter((x) => x.key !== p?.key)
				.map((x) => ({
					id: `project-${x.key}`,
					label: `${x.name}: ${m.board()}`,
					hint: x.key,
					icon: SquareKanban,
					run: () => goto(`/projects/${x.key}/board`)
				})),
			...(p && current.canEdit
				? [
						{
							id: 'settings',
							label: `${p.name}: ${m.settings()}`,
							icon: Settings,
							run: () => goto(`/projects/${p.key}/settings`)
						}
					]
				: []),
			...(isAdmin ? [{ id: 'forms', label: m.forms(), icon: Inbox, run: () => goto('/settings/forms') }] : []),
			{ id: 'api', label: m.api_tokens(), icon: KeyRound, run: () => goto('/settings/api') },
			...(isAdmin
				? [
						{ id: 'users', label: m.um_users(), icon: Users, run: () => goto('/admin/users') },
						{ id: 'teams', label: m.teams_admin_title(), icon: MessagesSquare, run: () => goto('/admin/teams') }
					]
				: [])
		];
	});

	const appearance: Action[] = [
		{ id: 'light', label: m.command_theme({ mode: m.light() }), icon: Sun, run: () => setMode('light') },
		{ id: 'dark', label: m.command_theme({ mode: m.dark() }), icon: Moon, run: () => setMode('dark') },
		{ id: 'system', label: m.command_theme({ mode: m.system() }), icon: Monitor, run: () => setMode('system') }
	];

	const matches = (a: Action) => {
		const q = query.trim().toLowerCase();
		return !q || a.label.toLowerCase().includes(q) || !!a.hint?.toLowerCase().includes(q);
	};
	const groups = $derived(
		[
			{ heading: m.command_actions(), items: actions.filter(matches) },
			{ heading: m.command_navigation(), items: navigation.filter(matches) },
			{ heading: m.command_appearance(), items: appearance.filter(matches) }
		].filter((g) => g.items.length)
	);

	// Tickets erst nach einer kurzen Tipp-Pause suchen; veraltete Antworten verwerfen
	let request = 0;
	$effect(() => {
		const q = query.trim();
		const id = ++request;
		if (!open || !q) {
			tickets = [];
			searching = false;
			return;
		}
		searching = true;
		const timer = setTimeout(async () => {
			try {
				const result = await searchTickets(q);
				if (id !== request) return;
				tickets = result.tickets;
				if (tickets[0]) selected = `ticket-${tickets[0].key}`;
			} catch {
				if (id === request) tickets = [];
			} finally {
				if (id === request) searching = false;
			}
		}, 150);
		return () => clearTimeout(timer);
	});

	// Projekte für die Navigation beim Öffnen laden
	$effect(() => {
		if (!open) return;
		listProjects()
			.then((list) => (projects = list.map(({ key, name, color }) => ({ key, name, color }))))
			.catch(() => {});
	});

	/**
	 * Erst nach dem vollständigen Tastendruck schließen: Schließt die Palette schon beim keydown, landet
	 * der Fokus auf dem vorher aktiven Element (z.B. einem Link), und dessen keypress-Ereignis von
	 * Enter würde ihn auslösen und die Navigation abbrechen.
	 */
	function run(fn: () => unknown) {
		setTimeout(() => {
			open = false;
			query = '';
			void fn();
		});
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey) || event.altKey || event.repeat) return;
		// Andere Dialoge (z.B. ein offenes Ticket) behalten die Tastatur
		if (!open && document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
		event.preventDefault();
		open = !open;
	}
</script>

<svelte:window {onkeydown} />

<!-- Suchleiste in der Kopfzeile: öffnet die Palette, zeigt das Tastenkürzel -->
<button
	type="button"
	class={cn(
		'border-input bg-muted/40 text-muted-foreground hover:bg-muted flex h-8 w-60 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors',
		'max-lg:w-auto max-lg:border-transparent max-lg:bg-transparent max-lg:px-2',
		// Ab 1280 px mittig in der Kopfzeile und breiter (gemessen: passt neben Navigation und langen Namen)
		'xl:absolute xl:left-1/2 xl:h-9 xl:w-[26rem] xl:-translate-x-1/2'
	)}
	aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
	aria-label={m.command_open()}
	onclick={() => (open = true)}
	data-command-trigger
>
	<Search class="size-4 shrink-0" />
	<span class="grow text-left max-lg:hidden">{m.command_trigger()}</span>
	<kbd class="bg-background text-muted-foreground rounded border px-1.5 font-mono text-[11px] max-lg:hidden">
		{shortcutLabel}
	</kbd>
</button>

<Command.Dialog
	bind:open
	bind:value={selected}
	shouldFilter={false}
	title={m.command_title()}
	description={m.command_description()}
	class="sm:max-w-xl"
>
	<Command.Input placeholder={m.command_placeholder()} bind:value={query} />
	<Command.List class="max-h-[min(60vh,28rem)]">
		{#if query.trim()}
			<Command.Group heading={m.command_tickets()}>
				{#each tickets as t (t.id)}
					<Command.Item value={`ticket-${t.key}`} onSelect={() => run(() => goto(`/tickets/${t.key}`))}>
						<span class="text-muted-foreground w-16 shrink-0 font-mono text-xs">{t.key}</span>
						<span class={cn('truncate', t.closed && 'text-muted-foreground line-through')}>{t.title}</span>
					</Command.Item>
				{:else}
					<div class="text-muted-foreground flex items-center gap-2 px-2 py-2 text-sm">
						{#if searching}<LoaderCircle class="size-4 animate-spin" />
							{m.command_searching()}{:else}{m.command_no_tickets()}{/if}
					</div>
				{/each}
			</Command.Group>
		{/if}
		{#each groups as group (group.heading)}
			<Command.Group heading={group.heading}>
				{#each group.items as item (item.id)}
					<Command.Item value={item.id} onSelect={() => run(item.run)}>
						<item.icon />
						<span class="truncate">{item.label}</span>
						{#if item.hint}<Command.Shortcut>{item.hint}</Command.Shortcut>{/if}
					</Command.Item>
				{/each}
			</Command.Group>
		{/each}
	</Command.List>
</Command.Dialog>
