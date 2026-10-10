<script lang="ts">
	import { localizeError } from '$lib/i18n';
	import { intlLocale } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import Hint from '$lib/components/Hint.svelte';
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
	const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString(intlLocale()) : m.never());

	let copied = $state(false);
	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		toast.success(m.token_copied());
		setTimeout(() => (copied = false), 1500);
	}

	const mcpUrl = $derived(`${origin}/api/v1/mcp`);
	let copiedMcp = $state(false);
	async function copyMcpUrl() {
		await navigator.clipboard.writeText(mcpUrl);
		copiedMcp = true;
		toast.success(m.mcp_url_copied());
		setTimeout(() => (copiedMcp = false), 1500);
	}

	const endpoints = [
		['GET', '/projects', m.list_projects()],
		['GET', '/events?project=:projekt', m.live_updates_events()],
		['POST', '/projects', m.endpoint_create_project() + ' {name, key?, description?, color?}'],
		['GET', '/projects/:projekt/tickets?closed=false', m.list_tickets()],
		['POST', '/projects/:projekt/tickets', m.create_ticket_tags_list_of_ids_or_names()],
		['GET', '/projects/:projekt/tags', m.list_project_tags()],
		['POST', '/projects/:projekt/tags', m.endpoint_create_tag() + ' {name, color?}'],
		['PATCH', '/projects/:projekt/tags/:id', m.endpoint_update_tag() + ' {name?, color?}'],
		['DELETE', '/projects/:projekt/tags/:id', m.delete_tag()],
		['GET', '/tickets/:ticket', m.ticket_with_subtasks_and_links()],
		['PATCH', '/tickets/:ticket', m.update_ticket_column_moves_it_assignee_assigns_it_tags_replaces_all_ta()],
		['POST', '/tickets/:ticket/close', m.complete_ticket()],
		['POST', '/tickets/:ticket/reopen', m.reopen_ticket()],
		['POST', '/tickets/:ticket/subtasks', m.create_subtask()],
		['GET', '/tickets/:ticket/attachments', m.list_attachments()],
		['POST', '/tickets/:ticket/attachments?filename=bild.png', m.upload_attachment_file_as_body()],
		['GET', '/attachments/:id', m.download_attachment_download_forces_download()],
		['DELETE', '/attachments/:id', m.delete_attachment()],
		['POST', '/tickets/:ticket/links', m.endpoint_link() + ' {target, type: depends_on|blocks|relates}'],
		['DELETE', '/tickets/:ticket/links/:id', m.remove_link()],
		['DELETE', '/tickets/:ticket', m.delete_ticket()],
		['GET', '/users', m.users_for_assignee()]
	];
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-8">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">API</h1>
		<p class="text-muted-foreground mt-1 text-sm">{m.manage_tokens_for_scripts_and_other_applications()}</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.api_tokens()}</Card.Title>
			<Card.Description>{m.tokens_let_other_applications_create_update_and_complete_tickets_each_()}</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			{#if form?.token}
				<Alert.Root class="text-success border-success/30 bg-success/5">
					<CircleCheck />
					<Alert.Title>{m.new_token_created()}</Alert.Title>
					<Alert.Description>
						<div class="mt-1 flex w-full items-center gap-2">
							<code
								class="bg-background text-foreground grow rounded-md border px-2.5 py-1.5 font-mono text-xs break-all select-all"
								>{form.token}</code
							>
							<Hint text={m.copy()}>
								{#snippet children(props)}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label={m.copy_token()}
										onclick={() => copy(form.token!)}
									>
										{#if copied}<Check />{:else}<Copy />{/if}
									</Button>
								{/snippet}
							</Hint>
						</div>
						<span class="text-muted-foreground text-xs">{m.copy_it_now_it_won_t_be_shown_again()}</span>
					</Alert.Description>
				</Alert.Root>
			{/if}
			{#if form?.error}<p class="text-destructive text-sm">{localizeError(form.error)}</p>{/if}

			<form method="POST" action="?/create" class="flex gap-2" use:enhance>
				<InputGroup.Root>
					<InputGroup.Addon><KeyRound /></InputGroup.Addon>
					<InputGroup.Input name="name" placeholder={m.name_e_g_ci_pipeline()} required />
				</InputGroup.Root>
				<Button type="submit"><Plus /> {m.create_token()}</Button>
			</form>

			{#if data.tokens.length}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.name()}</Table.Head>
							<Table.Head>{m.token()}</Table.Head>
							<Table.Head>{m.created_2()}</Table.Head>
							<Table.Head>{m.last_used()}</Table.Head>
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
										<Button type="submit" variant="ghost" size="sm" class="hover:text-destructive"
											><Trash2 /> {m.revoke()}</Button
										>
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
			<Card.Title>{m.mcp_title()}</Card.Title>
			<Card.Description>{m.mcp_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="gap-4">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.mcp_endpoint()}</span>
				<div class="flex items-center gap-2">
					<code
						class="bg-muted grow rounded-md px-2.5 py-1.5 font-mono text-xs break-all select-all"
						data-testid="mcp-url">{mcpUrl}</code
					>
					<Hint text={m.copy()}>
						{#snippet children(props)}
							<Button {...props} variant="outline" size="icon-sm" aria-label={m.mcp_copy_url()} onclick={copyMcpUrl}>
								{#if copiedMcp}<Check />{:else}<Copy />{/if}
							</Button>
						{/snippet}
					</Hint>
				</div>
			</div>

			<h3 class="mt-2 text-sm font-semibold">{m.mcp_example_config()}</h3>
			<pre class="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">{`{
  "mcpServers": {
    "kenny": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}`}</pre>

			<h3 class="mt-2 text-sm font-semibold">{m.mcp_example_claude_code()}</h3>
			<pre
				class="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">{`claude mcp add --transport http kenny ${mcpUrl} \\
  --header "Authorization: Bearer $KENNY_TOKEN"`}</pre>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.quick_reference()}</Card.Title>
			<Card.Description>
				{m.all_endpoints_are_under()} <code class="font-mono">{origin}/api/v1</code>
				{m.and_require()}
				<code class="font-mono">Authorization: Bearer &lt;token&gt;</code>{m.tickets_can_be_addressed_by_id()}<code
					class="font-mono">42</code
				>{m.or_key()}<code class="font-mono">WEB-12</code>{m.projects_by_id_or_key()}
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

			<h3 class="mt-2 text-sm font-semibold">{m.example_create_a_ticket()}</h3>
			<pre
				class="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">{`curl -X POST ${origin}/api/v1/projects/WEB/tickets \\
  -H "Authorization: Bearer $KENNY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "${m.example_ticket_title()}",
    "description": "Optional",
    "priority": "high",
    "column": "In Arbeit",
    "assignee": "name@firma.de",
    "startDate": "2026-10-10",
    "dueDate": "2026-10-17",
    "parent": "WEB-3",
    "dependsOn": ["WEB-1", "WEB-2"]
  }'`}</pre>

			<h3 class="mt-2 text-sm font-semibold">{m.example_complete_a_ticket()}</h3>
			<pre
				class="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">{`curl -X POST ${origin}/api/v1/tickets/WEB-12/close \\
  -H "Authorization: Bearer $KENNY_TOKEN"`}</pre>
		</Card.Content>
	</Card.Root>
</div>
