<script lang="ts">
	import { intlLocale } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';

	let {
		value,
		onchange,
		min,
		placeholder = m.choose_date(),
		id,
		disabled = false,
		class: className
	}: {
		/** Datum als YYYY-MM-DD oder null */
		value: string | null;
		onchange: (value: string | null) => void;
		/** Frühestes wählbares Datum (YYYY-MM-DD), z.B. der Start bei „Fällig“ */
		min?: string | null;
		placeholder?: string;
		id?: string;
		disabled?: boolean;
		class?: string;
	} = $props();

	let open = $state(false);

	const parse = (s: string | null | undefined) => {
		try {
			return s ? parseDate(s) : undefined;
		} catch {
			return undefined;
		}
	};
	const current = $derived(parse(value));
	const minValue = $derived(parse(min));
	const label = $derived(
		current
			? current
					.toDate(getLocalTimeZone())
					.toLocaleDateString(intlLocale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
			: placeholder
	);

	function pick(v: DateValue | undefined) {
		open = false;
		const s = v?.toString() ?? null;
		if (s !== value) onchange(s);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{disabled}
		{id}
		class={cn(
			buttonVariants({ variant: 'outline' }),
			'w-full justify-start px-2.5 font-normal',
			!current && 'text-muted-foreground',
			className
		)}
	>
		<CalendarIcon class="text-muted-foreground" />
		<span class="truncate">{label}</span>
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<Calendar
			type="single"
			value={current}
			onValueChange={(v) => pick(v as DateValue | undefined)}
			locale={intlLocale()}
			weekStartsOn={1}
			captionLayout="dropdown"
			{minValue}
			initialFocus
		/>
		<div class="flex justify-between gap-2 border-t p-2">
			<Button variant="ghost" size="sm" onclick={() => pick(today(getLocalTimeZone()))}>{m.today()}</Button>
			{#if current}
				<Button variant="ghost" size="sm" class="hover:text-destructive" onclick={() => pick(undefined)}
					>{m.remove()}</Button
				>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
