<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { accentStyle, accentVars } from '$lib/theme';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Toaster } from '$lib/components/ui/sonner';
	import { cn } from '$lib/utils';
	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';

	let { data, children } = $props();

	// Markiert die fertige Hydration; E2E-Tests warten darauf, bevor sie klicken
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});

	const links = [
		{ href: '/', label: 'Projekte', icon: FolderKanban, match: (p: string) => p === '/' || p.startsWith('/projects') || p.startsWith('/tickets') },
		{ href: '/settings/api', label: 'API', icon: KeyRound, match: (p: string) => p.startsWith('/settings') }
	];

	// In Projekten (und deren Tickets) wird die Projektfarbe zur Primärfarbe.
	// Der Wrapper sorgt für das erste Rendern, <html> für Dialoge/Popover, die in <body> gerendert werden.
	const projectColor = $derived((page.data as { project?: { color?: string } }).project?.color);
	$effect(() => {
		const root = document.documentElement;
		const vars = accentVars(projectColor);
		for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
		return () => Object.keys(vars).forEach((k) => root.style.removeProperty(k));
	});

	async function logout() {
		await authClient.signOut();
		await goto('/login', { invalidateAll: true });
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Kenny</title>
</svelte:head>

<ModeWatcher />
<Toaster richColors position="bottom-right" />

<div class="contents" style={accentStyle(projectColor)}>
	{#if data.user}
		<header class="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-5 backdrop-blur">
			<a href="/" class="mr-3 flex items-center gap-2 font-semibold tracking-tight">
				<span class="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg">
					<SquareKanban class="size-4" strokeWidth={2.25} />
				</span>
				Kenny
			</a>
			<nav class="flex gap-1">
				{#each links as l (l.href)}
					<a
						href={l.href}
						class={cn(
							'text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
							l.match(page.url.pathname) && 'bg-muted text-foreground'
						)}
					>
						<l.icon class="size-4" />
						<span class="max-sm:hidden">{l.label}</span>
					</a>
				{/each}
			</nav>
			<span class="grow"></span>
			<ThemeToggle />
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="hover:bg-muted flex items-center gap-2 rounded-md py-1 pr-2 pl-1 text-sm font-medium outline-none">
					<UserAvatar name={data.user.name} size="sm" />
					<span class="max-sm:hidden">{data.user.name}</span>
					<ChevronDown class="text-muted-foreground size-3.5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-56">
					<DropdownMenu.Label class="font-normal">
						<div class="font-medium">{data.user.name}</div>
						<div class="text-muted-foreground truncate text-xs">{data.user.email}</div>
					</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={() => goto('/settings/api')}>
						<KeyRound /> API-Tokens
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={logout}>
						<LogOut /> Abmelden
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</header>
	{:else}
		<div class="fixed top-3.5 right-5 z-30"><ThemeToggle /></div>
	{/if}

	<main>
		{@render children()}
	</main>
</div>
