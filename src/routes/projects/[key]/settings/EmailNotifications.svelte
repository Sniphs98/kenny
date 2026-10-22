<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { sendTestEmailNotification, updateEmailNotifications } from '#lib/api.js';
	import {
		EMAIL_NOTIFICATION_EVENTS,
		NOTIFICATION_LOCALES,
		type EmailNotificationEvent,
		type EmailNotificationsDto
	} from '#lib/contracts/index.js';
	import { intlLocale, localizeError } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Mail from '@lucide/svelte/icons/mail';
	import Send from '@lucide/svelte/icons/send';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { project, notifications }: { project: string; notifications: EmailNotificationsDto } = $props();
	const EVENT_LABELS: Record<EmailNotificationEvent, string> = {
		created: m.email_notification_event_created(),
		closed: m.email_notification_event_closed(),
		public_comment: m.email_notification_event_public_comment()
	};
	const LOCALE_LABELS = { de: 'Deutsch', en: 'English' };
	let events = $state<EmailNotificationEvent[]>(untrack(() => [...notifications.events]));
	let locale = $state(untrack(() => notifications.locale));
	let senderName = $state(untrack(() => notifications.senderName));
	let busy = $state<'save' | 'test' | 'remove' | null>(null);

	function toggle(event: EmailNotificationEvent, on: boolean) {
		events = on ? [...events, event] : events.filter((item) => item !== event);
	}

	async function act(kind: NonNullable<typeof busy>, action: () => Promise<unknown>, success: string) {
		busy = kind;
		try {
			await action();
			await refreshAll();
			toast.success(success);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			busy = null;
		}
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		return act(
			'save',
			() => updateEmailNotifications(project, { enabled: true, events, locale, senderName }),
			m.email_notification_saved()
		);
	}
</script>

<Card.Root data-email-notifications>
	<Card.Header class="flex items-start gap-3">
		<span class="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg"
			><Mail class="size-4" /></span
		>
		<div class="grow">
			<Card.Title>{m.email_notification_title()}</Card.Title>
			<Card.Description>{m.email_notification_description()}</Card.Description>
		</div>
		{#if notifications.configured}<Badge variant="secondary">{m.notification_active()}</Badge>{/if}
	</Card.Header>
	<Card.Content>
		<form class="grid gap-4" onsubmit={save}>
			{#if !notifications.smtpConfigured}
				<p class="text-destructive text-sm" role="alert">{m.email_notification_smtp_missing()}</p>
			{/if}
			<fieldset class="grid gap-2">
				<legend class="mb-2 text-sm font-medium">{m.notification_events()}</legend>
				{#each EMAIL_NOTIFICATION_EVENTS as event (event)}
					<Label class="font-normal">
						<Checkbox checked={events.includes(event)} onCheckedChange={(on) => toggle(event, on)} />
						{EVENT_LABELS[event]}
					</Label>
				{/each}
			</fieldset>
			<div class="grid gap-2 sm:max-w-56">
				<Label id="email-notification-locale">{m.notification_language()}</Label>
				<Select.Root type="single" bind:value={locale}>
					<Select.Trigger class="w-full" aria-labelledby="email-notification-locale"
						>{LOCALE_LABELS[locale]}</Select.Trigger
					>
					<Select.Content>
						{#each NOTIFICATION_LOCALES as language (language)}<Select.Item value={language}
								>{LOCALE_LABELS[language]}</Select.Item
							>{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-2 sm:max-w-sm">
				<Label for="email-notification-sender">{m.email_notification_sender_name()}</Label>
				<Input id="email-notification-sender" bind:value={senderName} maxlength={100} required />
				<p class="text-muted-foreground text-xs">{m.email_notification_sender_name_description()}</p>
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
				<Button type="submit" disabled={!!busy}>
					{#if busy === 'save'}<LoaderCircle class="animate-spin" />{/if}
					{m.save()}
				</Button>
				{#if notifications.configured}
					<Button
						variant="outline"
						disabled={!!busy || !notifications.smtpConfigured}
						onclick={() => act('test', () => sendTestEmailNotification(project), m.email_notification_test_sent())}
					>
						{#if busy === 'test'}<LoaderCircle class="animate-spin" />{:else}<Send />{/if}
						{m.email_notification_send_test()}
					</Button>
					<Button
						variant="ghost"
						class="hover:text-destructive sm:ml-auto"
						disabled={!!busy}
						onclick={() =>
							act(
								'remove',
								() => updateEmailNotifications(project, { enabled: false }),
								m.email_notification_removed()
							)}><Trash2 /> {m.notification_remove()}</Button
					>
				{/if}
			</div>
		</form>
	</Card.Content>
</Card.Root>
