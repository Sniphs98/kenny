<script lang="ts">
	import { withoutBase } from '#lib/paths.js';
	import { withBase } from '#lib/paths.js';
	import { intlLocale } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { accentStyle } from '#lib/theme.js';
	import { rememberTicketStatus } from '#lib/ticket-status-storage.js';
	import { onMount } from 'svelte';
	import MarkdownViewer from '#lib/components/MarkdownViewer.svelte';
	import TagBadge from '#lib/components/TagBadge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Clock3 from '@lucide/svelte/icons/clock-3';
	import MessageSquare from '@lucide/svelte/icons/message-square';

	let { data, form } = $props();
	const ticket = $derived(form?.ticket ?? data.ticket);
	const dateTime = (value: Date) => value.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
	let commentBody = $state('');

	$effect(() => {
		commentBody = form?.body ?? '';
	});

	onMount(() => {
		rememberTicketStatus({
			key: ticket.key,
			title: ticket.title,
			path: withoutBase(window.location.pathname),
			status: ticket.status,
			closed: ticket.closed,
			updatedAt: ticket.updatedAt.getTime(),
			projectName: ticket.project.name,
			projectColor: ticket.project.color
		});
	});
</script>

<svelte:head>
	<title>{m.ticket_status_title({ key: ticket.key })} · Kenny</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="strict-origin" />
</svelte:head>

<div
	class="min-h-screen bg-background bg-[radial-gradient(circle_at_50%_0%,var(--primary-soft),transparent_60%)] px-4 py-12"
	style={accentStyle(ticket.project.color)}
>
	<div class="mx-auto grid w-full max-w-2xl gap-5">
		<header class="relative text-center">
			<Button href={withBase('/status')} variant="outline" class="mb-5 sm:absolute sm:top-0 sm:left-0 sm:mb-0"
				>{m.my_tickets()}</Button
			>
			<p class="text-primary text-sm font-semibold">{ticket.project.name} · {ticket.key}</p>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight">{ticket.title}</h1>
		</header>

		<Card.Root>
			<Card.Content class="grid gap-x-8 gap-y-5 pt-6 sm:grid-cols-2">
				<div>
					<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">{m.status()}</p>
					<div class="mt-2 flex items-center gap-2 font-medium">
						{#if ticket.closed}<CircleCheck class="text-success size-5" />{:else}<Clock3
								class="text-primary size-5"
							/>{/if}
						{ticket.status}
					</div>
				</div>
				<div>
					<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">{m.last_updated()}</p>
					<p class="mt-2 font-medium">
						<time datetime={ticket.updatedAt.toISOString()}>{dateTime(ticket.updatedAt)}</time>
					</p>
				</div>
				<div>
					<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">{m.assignee()}</p>
					<p class="mt-2 font-medium">{ticket.assignees.length ? ticket.assignees.join(', ') : m.unassigned()}</p>
				</div>
				<div>
					<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">{m.system()}</p>
					<p class="mt-2 font-medium">{ticket.system ?? m.none()}</p>
				</div>
				<div>
					<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">{m.created_by()}</p>
					<p class="mt-2 font-medium">{ticket.createdBy ?? m.ticket_submitter()}</p>
				</div>
				<div>
					<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">{m.tags()}</p>
					{#if ticket.tags.length}
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each ticket.tags as tag (tag.name)}<TagBadge name={tag.name} color={tag.color} />{/each}
						</div>
					{:else}
						<p class="mt-2 font-medium">{m.no_tags()}</p>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="gap-4">
			<Card.Header><Card.Title>{m.description()}</Card.Title></Card.Header>
			<Card.Content>
				{#if ticket.description}<MarkdownViewer value={ticket.description} />{:else}<p
						class="text-muted-foreground text-sm"
					>
						{m.no_description()}
					</p>{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="gap-4">
			<Card.Header>
				<Card.Title class="flex items-center gap-2"><MessageSquare class="size-5" />{m.public_updates()}</Card.Title>
			</Card.Header>
			<Card.Content class="grid gap-5">
				{#if ticket.comments.length}
					<div class="grid gap-3">
						{#each ticket.comments as comment (comment.id)}
							<article
								class={comment.isReporter
									? 'bg-background ml-6 rounded-xl border-2 border-primary/40 p-4 shadow-sm'
									: 'bg-primary-soft mr-6 rounded-xl border border-primary/60 p-4'}
							>
								<div class="mb-2 flex flex-wrap items-center gap-2">
									<strong class="text-sm"
										>{comment.isReporter ? m.ticket_submitter() : (comment.authorName ?? m.support_team())}</strong
									>
									<time class="text-muted-foreground text-xs" datetime={comment.createdAt.toISOString()}
										>{dateTime(comment.createdAt)}</time
									>
								</div>
								<MarkdownViewer value={comment.body} />
							</article>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-sm">{m.no_public_updates()}</p>
				{/if}

				<form method="POST" class="grid gap-3">
					<div class="grid gap-2">
						<Label for="status-comment">{m.reply()}</Label>
						<Textarea
							id="status-comment"
							name="body"
							rows={5}
							maxlength={100000}
							required
							bind:value={commentBody}
							placeholder={m.write_comment()}
						/>
					</div>
					{#if form?.message}<p class="text-destructive text-sm" role="alert">{form.message}</p>{/if}
					{#if form?.success}<p class="text-success flex items-center gap-2 text-sm" role="status">
							<Check class="size-4" />{m.reply_sent()}
						</p>{/if}
					<Button type="submit" class="justify-self-end">{m.send_reply()}</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<p class="text-muted-foreground text-center text-xs">{m.status_link_private_hint()}</p>
	</div>
</div>
