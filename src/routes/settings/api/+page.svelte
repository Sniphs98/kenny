<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Table from '$lib/components/ui/table';
	import { toast } from 'svelte-sonner';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Copy from '@lucide/svelte/icons/copy';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data, form } = $props();

	const origin = $derived(page.url.origin);
	const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('de-DE') : 'nie');

	let copied = $state(false);
	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		toast.success('Token kopiert');
		setTimeout(() => (copied = false), 1500);
	}

	const endpoints = [
		['GET', '/projects', 'Projekte auflisten'],
		['POST', '/projects', 'Projekt anlegen {name, key?, description?, color?}'],
		['GET', '/projects/:projekt/tickets?closed=false', 'Tickets auflisten'],
		['POST', '/projects/:projekt/tickets', 'Ticket anlegen (tags: Liste aus IDs oder Namen)'],
		['GET', '/projects/:projekt/tags', 'Tags des Projekts auflisten'],
		['POST', '/projects/:projekt/tags', 'Tag anlegen {name, color?}'],
		['PATCH', '/projects/:projekt/tags/:id', 'Tag ändern {name?, color?}'],
		['DELETE', '/projects/:projekt/tags/:id', 'Tag löschen'],
		['GET', '/tickets/:ticket', 'Ticket mit Unteraufgaben und Verknüpfungen'],
		['PATCH', '/tickets/:ticket', 'Ticket ändern (auch column zum Verschieben, assignee zum Zuweisen, tags ersetzt alle Tags)'],
		['POST', '/tickets/:ticket/close', 'Ticket abschließen'],
		['POST', '/tickets/:ticket/reopen', 'Ticket wieder öffnen'],
		['POST', '/tickets/:ticket/subtasks', 'Unteraufgabe anlegen'],
		['POST', '/tickets/:ticket/links', 'Verknüpfen {target, type: depends_on|blocks|relates}'],
		['DELETE', '/tickets/:ticket/links/:id', 'Verknüpfung entfernen'],
		['DELETE', '/tickets/:ticket', 'Ticket löschen'],
		['GET', '/users', 'Benutzer (für assignee)']
	];
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-8">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">API</h1>
		<p class="text-muted-foreground mt-1 text-sm">Tokens für Skripte und andere Programme verwalten.</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>API-Tokens</Card.Title>
			<Card.Description>
				Mit einem Token können andere Programme Tickets anlegen, ändern und abschließen. Das Token wird nur einmal
				angezeigt.
			</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			{#if form?.token}
				<Alert.Root class="text-success border-success/30 bg-success/5">
					<CircleCheck />
					<Alert.Title>Neues Token erstellt</Alert.Title>
					<Alert.Description>
						<div class="mt-1 flex w-full items-center gap-2">
							<code class="bg-background text-foreground grow rounded-md border px-2.5 py-1.5 font-mono text-xs break-all select-all">{form.token}</code>
							<Button variant="outline" size="icon-sm" title="Kopieren" aria-label="Token kopieren" onclick={() => copy(form.token!)}>
								{#if copied}<Check />{:else}<Copy />{/if}
							</Button>
						</div>
						<span class="text-muted-foreground text-xs">Jetzt kopieren, es wird nicht noch einmal angezeigt.</span>
					</Alert.Description>
				</Alert.Root>
			{/if}
			{#if form?.error}<p class="text-destructive text-sm">{form.error}</p>{/if}

			<form method="POST" action="?/create" class="flex gap-2" use:enhance>
				<InputGroup.Root>
					<InputGroup.Addon><KeyRound /></InputGroup.Addon>
					<InputGroup.Input name="name" placeholder="Name, z.B. CI-Pipeline" required />
				</InputGroup.Root>
				<Button type="submit"><Plus /> Token erstellen</Button>
			</form>

			{#if data.tokens.length}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Token</Table.Head>
							<Table.Head>Erstellt</Table.Head>
							<Table.Head>Zuletzt benutzt</Table.Head>
							<Table.Head></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.tokens as t (t.id)}
							<Table.Row>
								<Table.Cell class="font-medium">{t.name}</Table.Cell>
								<Table.Cell><code class="text-muted-foreground font-mono text-xs">{t.prefix}…</code></Table.Cell>
								<Table.Cell>{fmt(t.createdAt)}</Table.Cell>
								<Table.Cell>{fmt(t.lastUsedAt)}</Table.Cell>
								<Table.Cell class="text-right">
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={t.id} />
										<Button type="submit" variant="ghost" size="sm" class="hover:text-destructive"><Trash2 /> Widerrufen</Button>
									</form>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Kurzreferenz</Card.Title>
			<Card.Description>
				Alle Endpunkte liegen unter <code class="font-mono">{origin}/api/v1</code> und erwarten
				<code class="font-mono">Authorization: Bearer &lt;token&gt;</code>. Tickets können per ID (<code class="font-mono">42</code>) oder
				Schlüssel (<code class="font-mono">WEB-12</code>) angesprochen werden, Projekte per ID oder Kürzel.
			</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			<Table.Root>
				<Table.Body>
					{#each endpoints as [method, path, desc] (method + path)}
						<Table.Row>
							<Table.Cell class="w-20"><Badge variant="outline" class="font-mono">{method}</Badge></Table.Cell>
							<Table.Cell class="font-mono text-xs">{path}</Table.Cell>
							<Table.Cell class="text-muted-foreground whitespace-normal">{desc}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>

			<h3 class="mt-2 text-sm font-semibold">Beispiel: Ticket anlegen</h3>
			<pre class="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">{`curl -X POST ${origin}/api/v1/projects/WEB/tickets \\
  -H "Authorization: Bearer $KENNY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Login-Seite überarbeiten",
    "description": "Optional",
    "priority": "high",
    "column": "In Arbeit",
    "assignee": "name@firma.de",
    "startDate": "2026-10-10",
    "dueDate": "2026-10-17",
    "parent": "WEB-3",
    "dependsOn": ["WEB-1", "WEB-2"]
  }'`}</pre>

			<h3 class="mt-2 text-sm font-semibold">Beispiel: Ticket abschließen</h3>
			<pre class="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">{`curl -X POST ${origin}/api/v1/tickets/WEB-12/close \\
  -H "Authorization: Bearer $KENNY_TOKEN"`}</pre>
		</Card.Content>
	</Card.Root>
</div>
