<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { chooseLocale, storedLocale } from '$lib/locale-choice';
	import { m } from '$lib/paraglide/messages.js';
	import { isLocale } from '$lib/paraglide/runtime.js';
	import Languages from '@lucide/svelte/icons/languages';

	// Untermenü im Benutzermenü; wird erst beim Öffnen im Browser gerendert
	const value = storedLocale();

	function choose(next: string) {
		if (next !== value && (next === 'system' || isLocale(next))) chooseLocale(next);
	}
</script>

<DropdownMenu.Sub>
	<DropdownMenu.SubTrigger>
		<Languages />
		{m.language()}
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent class="w-48">
		<DropdownMenu.RadioGroup {value} onValueChange={choose}>
			<DropdownMenu.RadioItem value="system">{m.system_language()}</DropdownMenu.RadioItem>
			<DropdownMenu.Separator />
			<DropdownMenu.RadioItem value="de">{m.language_de()}</DropdownMenu.RadioItem>
			<DropdownMenu.RadioItem value="en">{m.language_en()}</DropdownMenu.RadioItem>
		</DropdownMenu.RadioGroup>
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
