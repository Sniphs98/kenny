<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { updateNtfyNotifications } from '#lib/api.js';
	import { NTFY_NOTIFICATION_EVENTS, type NtfyNotificationEvent } from '#lib/contracts/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let events = $state<NtfyNotificationEvent[]>([...data.ntfy.events]);
	let testMode = $state(data.ntfy.testMode);
	let busy = $state(false);
	const labels: Record<NtfyNotificationEvent, string> = {
		ticket_created: m.ntfy_event_ticket_created(),
		ticket_assigned: m.ntfy_event_ticket_assigned(),
		creator_commented_unassigned: m.ntfy_event_creator_commented_unassigned(),
		assigned_ticket_commented: m.ntfy_event_assigned_ticket_commented(),
		due_today: m.ntfy_event_due_today(),
		overdue: m.ntfy_event_overdue(),
		assigned_ticket_status_changed: m.ntfy_event_assigned_ticket_status_changed(),
		ticket_unassigned: m.ntfy_event_ticket_unassigned()
	};
	function toggle(event: NtfyNotificationEvent, on: boolean) {
		events = on ? [...events, event] : events.filter((current) => current !== event);
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		try {
			await updateNtfyNotifications({ events, testMode });
			await refreshAll();
			toast.success(m.ntfy_saved());
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl px-5 py-8">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.ntfy_title()}</Card.Title>
			<Card.Description>{m.ntfy_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form class="grid gap-5" onsubmit={save}>
				<div class="grid gap-2">
					<span class="text-sm font-medium">{m.ntfy_topic()}</span>
					<code class="bg-muted rounded-md px-3 py-2 text-sm select-all">{data.ntfy.topic}</code>
					<p class="text-muted-foreground text-xs">{m.ntfy_topic_hint()}</p>
				</div>
				<fieldset class="grid gap-2">
					<legend class="mb-2 text-sm font-medium">{m.notification_events()}</legend>
					{#each NTFY_NOTIFICATION_EVENTS as event (event)}
						<Label class="font-normal"
							><Checkbox checked={events.includes(event)} onCheckedChange={(on) => toggle(event, on)} />{labels[
								event
							]}</Label
						>
					{/each}
				</fieldset>
				<Label class="font-normal"
					><Checkbox checked={testMode} onCheckedChange={(on) => (testMode = on)} />{m.ntfy_test_mode()}</Label
				>
				<Button type="submit" disabled={busy}>{m.save()}</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
