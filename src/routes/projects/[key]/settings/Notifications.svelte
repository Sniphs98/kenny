<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { sendTestNotification, updateNotifications } from '$lib/api';
	import {
		NOTIFICATION_EVENTS,
		NOTIFICATION_LOCALES,
		isAllowedWebhookUrl,
		type NotificationEvent,
		type NotificationsDto
	} from '$lib/contracts';
	import { intlLocale, localizeError } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Send from '@lucide/svelte/icons/send';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { project, notifications }: { project: string; notifications: NotificationsDto } = $props();

	const EVENT_LABELS: Record<NotificationEvent, string> = {
		created: m.notification_event_created(),
		closed: m.notification_event_closed(),
		assigned: m.notification_event_assigned()
	};
	const LOCALE_LABELS = { de: 'Deutsch', en: 'English' };

	/** Neue Adresse; leer heißt bei bestehender Einrichtung: Adresse beibehalten */
	let webhookUrl = $state('');
	let events = $state<NotificationEvent[]>(untrack(() => [...notifications.events]));
	let locale = $state(untrack(() => notifications.locale));
	let busy = $state<'save' | 'test' | 'remove' | null>(null);

	const urlError = $derived(
		webhookUrl.trim() && !isAllowedWebhookUrl(webhookUrl.trim()) ? m.notification_invalid_url() : ''
	);
	const canSave = $derived(!urlError && (notifications.configured || !!webhookUrl.trim()));

	function toggle(event: NotificationEvent, on: boolean) {
		events = on ? [...events, event] : events.filter((e) => e !== event);
	}

	async function act(kind: NonNullable<typeof busy>, fn: () => Promise<unknown>, success: string) {
		busy = kind;
		try {
			await fn();
			await invalidateAll();
			toast.success(success);
			if (kind !== 'test') webhookUrl = '';
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			busy = null;
		}
	}

	const save = (e: SubmitEvent) => {
		e.preventDefault();
		return act(
			'save',
			() =>
				updateNotifications(project, {
					...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
					events,
					locale
				}),
			m.notification_saved()
		);
	};
</script>

<Card.Root data-notifications>
	<Card.Header class="flex items-start gap-3">
		<span class="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg"
			><MessagesSquare class="size-4" /></span
		>
		<div class="grow">
			<Card.Title>{m.notification_title()}</Card.Title>
			<Card.Description>{m.notification_description()}</Card.Description>
		</div>
		{#if notifications.configured}<Badge variant="secondary">{m.notification_active()}</Badge>{/if}
	</Card.Header>
	<Card.Content>
		<form class="grid gap-4" onsubmit={save}>
			<div class="grid gap-2">
				<Label for="notification-url">{m.notification_webhook_url()}</Label>
				<Input
					id="notification-url"
					type="url"
					autocomplete="off"
					bind:value={webhookUrl}
					placeholder={notifications.configured
						? m.notification_webhook_keep({ host: notifications.webhookHost ?? '' })
						: 'https://….logic.azure.com/workflows/…'}
					aria-invalid={urlError ? 'true' : undefined}
				/>
				{#if urlError}
					<p class="text-destructive text-sm">{urlError}</p>
				{:else}
					<p class="text-muted-foreground text-xs">{m.notification_webhook_hint()}</p>
				{/if}
			</div>
			<fieldset class="grid gap-2">
				<legend class="mb-2 text-sm font-medium">{m.notification_events()}</legend>
				{#each NOTIFICATION_EVENTS as event (event)}
					<Label class="font-normal">
						<Checkbox checked={events.includes(event)} onCheckedChange={(on) => toggle(event, on)} />
						{EVENT_LABELS[event]}
					</Label>
				{/each}
			</fieldset>
			<div class="grid gap-2 sm:max-w-56">
				<Label id="notification-locale">{m.notification_language()}</Label>
				<Select.Root type="single" bind:value={locale}>
					<Select.Trigger class="w-full" aria-labelledby="notification-locale">{LOCALE_LABELS[locale]}</Select.Trigger>
					<Select.Content>
						{#each NOTIFICATION_LOCALES as l (l)}<Select.Item value={l}>{LOCALE_LABELS[l]}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</div>
			{#if notifications.lastError}
				<p class="text-destructive text-sm" role="alert">
					{m.notification_last_error({ error: localizeError(notifications.lastError) })}
				</p>
			{:else if notifications.lastSentAt}
				<p class="text-muted-foreground text-xs">
					{m.notification_last_sent({ date: notifications.lastSentAt.toLocaleString(intlLocale()) })}
				</p>
			{/if}
			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={!canSave || !!busy}>
					{#if busy === 'save'}<LoaderCircle class="animate-spin" />{/if}
					{m.save()}
				</Button>
				{#if notifications.configured}
					<Button
						variant="outline"
						disabled={!!busy}
						onclick={() => act('test', () => sendTestNotification(project), m.notification_test_sent())}
					>
						{#if busy === 'test'}<LoaderCircle class="animate-spin" />{:else}<Send />{/if}
						{m.notification_send_test()}
					</Button>
					<Button
						variant="ghost"
						class="hover:text-destructive sm:ml-auto"
						disabled={!!busy}
						onclick={() =>
							act('remove', () => updateNotifications(project, { webhookUrl: null }), m.notification_removed())}
						><Trash2 /> {m.notification_remove()}</Button
					>
				{/if}
			</div>
		</form>
	</Card.Content>
</Card.Root>
