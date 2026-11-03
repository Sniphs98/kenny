<script lang="ts">
	import type { CommentDto } from '#lib/contracts/index.js';
	import { addComment, deleteComment } from '#lib/api.js';
	import { intlLocale } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import MarkdownEditor from './MarkdownEditor.svelte';
	import MarkdownViewer from './MarkdownViewer.svelte';
	import UserAvatar from './UserAvatar.svelte';
	import { Badge } from './ui/badge/index.js';
	import { Button } from './ui/button/index.js';
	import * as Card from './ui/card/index.js';
	import * as DropdownMenu from './ui/dropdown-menu/index.js';
	import { toast } from 'svelte-sonner';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';

	let {
		ticketId,
		comments,
		canEdit,
		refresh
	}: {
		ticketId: number;
		comments: CommentDto[];
		canEdit: boolean;
		refresh: () => Promise<void>;
	} = $props();
	let body = $state('');
	let internal = $state(false);
	let uploadCount = $state(0);
	let sending = $state(false);
	let commentEditor: MarkdownEditor;

	async function submit() {
		if (!body.trim() || sending || uploadCount) return;
		sending = true;
		try {
			await addComment(ticketId, { body, internal });
			commentEditor.clear();
			await refresh();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			sending = false;
		}
	}

	async function remove(commentId: number) {
		try {
			await deleteComment(ticketId, commentId);
			await refresh();
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

<Card.Root class="gap-4">
	<Card.Header>
		<Card.Title>{m.comments()} <span class="text-muted-foreground font-normal">({comments.length})</span></Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if comments.length}
			<div class="flex flex-col gap-3">
				{#each comments as comment (comment.id)}
					<article
						class={comment.internal
							? 'bg-muted/45 rounded-xl border border-dashed p-4'
							: comment.isReporter
								? 'bg-background ml-6 rounded-xl border-2 border-primary/40 p-4 shadow-sm'
								: 'bg-primary-soft rounded-xl border border-primary/60 p-4'}
					>
						<div class="flex gap-3">
							<UserAvatar
								name={comment.isReporter ? m.ticket_submitter() : comment.authorName}
								image={comment.authorImage}
								tooltip={false}
							/>
							<div class="min-w-0 grow">
								<div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
									<strong class="text-sm"
										>{comment.isReporter ? m.ticket_submitter() : (comment.authorName ?? m.deleted_user())}</strong
									>
									<time class="text-muted-foreground text-xs" datetime={comment.createdAt.toISOString()}>
										{comment.createdAt.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })}
									</time>
									<Badge
										variant={comment.internal ? 'secondary' : 'outline'}
										class={comment.internal ? '' : 'border-primary/60 bg-background/40'}
									>
										{comment.internal ? m.internal() : m.public()}
									</Badge>
									{#if canEdit}
										<DropdownMenu.Root>
											<DropdownMenu.Trigger
												class="text-muted-foreground hover:text-foreground ml-auto inline-flex size-7 items-center justify-center rounded-md hover:bg-background/60"
												aria-label={m.delete()}
											>
												<MoreHorizontal class="size-4" />
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end">
												<DropdownMenu.Item
													class="text-destructive focus:text-destructive"
													onSelect={() => remove(comment.id)}
												>
													{m.delete()}
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									{/if}
								</div>
								<MarkdownViewer value={comment.body} />
							</div>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<p class="text-muted-foreground text-sm">{m.no_comments()}</p>
		{/if}
		{#if canEdit}
			<div class="overflow-hidden rounded-lg border">
				<MarkdownEditor
					bind:this={commentEditor}
					bind:value={body}
					bind:uploadCount
					{ticketId}
					{refresh}
					autoSave={false}
					onSave={() => {}}
					placeholder={m.write_comment()}
				/>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-2 text-sm">
					<span>{m.internal()}</span>
					<button
						type="button"
						role="switch"
						aria-label={m.comment_visibility()}
						aria-checked={!internal}
						onclick={() => (internal = !internal)}
						class="relative h-6 w-11 rounded-full border bg-muted transition-colors aria-checked:bg-primary"
					>
						<span
							class="bg-background absolute top-0.5 left-0.5 size-4 rounded-full shadow-sm transition-transform"
							class:translate-x-5={!internal}
						></span>
					</button>
					<span>{m.public()}</span>
				</div>
				<Button disabled={!body.trim() || sending || uploadCount > 0} onclick={submit}>{m.post_comment()}</Button>
			</div>
			<p class="text-muted-foreground text-xs">{m.comment_visibility_note()}</p>
		{/if}
	</Card.Content>
</Card.Root>
