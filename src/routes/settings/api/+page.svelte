<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { data, form } = $props();

	const origin = $derived(page.url.origin);
	const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('de-DE') : 'nie');
</script>

<div class="page stack">
	<h1>API</h1>

	<section class="card section stack">
		<h2>API-Tokens</h2>
		<p class="muted">
			Mit einem Token können andere Programme Tickets anlegen, ändern und abschließen. Das Token wird
			nur einmal angezeigt.
		</p>

		{#if form?.token}
			<div class="newtoken">
				<strong>Neues Token:</strong>
				<pre>{form.token}</pre>
				<span class="muted">Jetzt kopieren, es wird nicht noch einmal angezeigt.</span>
			</div>
		{/if}
		{#if form?.error}<p class="error">{form.error}</p>{/if}

		<form method="POST" action="?/create" class="row" use:enhance>
			<input name="name" class="grow" placeholder="Name, z.B. CI-Pipeline" required />
			<button class="primary">Token erstellen</button>
		</form>

		{#if data.tokens.length}
			<table>
				<thead><tr><th>Name</th><th>Token</th><th>Erstellt</th><th>Zuletzt benutzt</th><th></th></tr></thead>
				<tbody>
					{#each data.tokens as t (t.id)}
						<tr>
							<td>{t.name}</td>
							<td><code>{t.prefix}…</code></td>
							<td>{fmt(t.createdAt)}</td>
							<td>{fmt(t.lastUsedAt)}</td>
							<td>
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={t.id} />
									<button class="ghost danger">Widerrufen</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section class="card section stack">
		<h2>Kurzreferenz</h2>
		<p class="muted">
			Alle Endpunkte liegen unter <code>{origin}/api/v1</code> und erwarten
			<code>Authorization: Bearer &lt;token&gt;</code>. Tickets können per ID (<code>42</code>) oder
			Schlüssel (<code>WEB-12</code>) angesprochen werden, Projekte per ID oder Kürzel.
		</p>
		<table class="endpoints">
			<tbody>
				<tr><td>GET</td><td>/projects</td><td>Projekte auflisten</td></tr>
				<tr><td>POST</td><td>/projects</td><td>Projekt anlegen <code>{'{name, key?, description?, color?}'}</code></td></tr>
				<tr><td>GET</td><td>/projects/:projekt/tickets?closed=false</td><td>Tickets auflisten</td></tr>
				<tr><td>POST</td><td>/projects/:projekt/tickets</td><td>Ticket anlegen</td></tr>
				<tr><td>GET</td><td>/tickets/:ticket</td><td>Ticket mit Unteraufgaben und Verknüpfungen</td></tr>
				<tr><td>PATCH</td><td>/tickets/:ticket</td><td>Ticket ändern (auch <code>column</code> zum Verschieben)</td></tr>
				<tr><td>POST</td><td>/tickets/:ticket/close</td><td>Ticket abschließen</td></tr>
				<tr><td>POST</td><td>/tickets/:ticket/reopen</td><td>Ticket wieder öffnen</td></tr>
				<tr><td>POST</td><td>/tickets/:ticket/subtasks</td><td>Unteraufgabe anlegen</td></tr>
				<tr><td>POST</td><td>/tickets/:ticket/links</td><td>Verknüpfen <code>{'{target, type: depends_on|blocks|relates}'}</code></td></tr>
				<tr><td>DELETE</td><td>/tickets/:ticket/links/:id</td><td>Verknüpfung entfernen</td></tr>
				<tr><td>DELETE</td><td>/tickets/:ticket</td><td>Ticket löschen</td></tr>
				<tr><td>GET</td><td>/users</td><td>Benutzer (für <code>assignee</code>)</td></tr>
			</tbody>
		</table>

		<h3>Beispiel: Ticket anlegen</h3>
		<pre>{`curl -X POST ${origin}/api/v1/projects/WEB/tickets \\
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

		<h3>Beispiel: Ticket abschließen</h3>
		<pre>{`curl -X POST ${origin}/api/v1/tickets/WEB-12/close \\
  -H "Authorization: Bearer $KENNY_TOKEN"`}</pre>
	</section>
</div>

<style>
	.section {
		padding: 1.25rem;
	}
	.section h2,
	.section h3 {
		margin: 0;
	}
	.newtoken {
		border: 1px solid var(--ok);
		border-radius: var(--radius);
		padding: 0.75rem;
	}
	.newtoken pre {
		margin: 0.4rem 0;
		user-select: all;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}
	th {
		color: var(--muted);
		font-weight: 500;
		font-size: 0.85rem;
	}
	.endpoints td:first-child {
		font-family: ui-monospace, monospace;
		font-weight: 600;
		width: 5em;
	}
	.endpoints td:nth-child(2) {
		font-family: ui-monospace, monospace;
	}
</style>
