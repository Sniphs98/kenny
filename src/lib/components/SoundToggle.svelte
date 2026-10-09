<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { m } from '$lib/paraglide/messages.js';
	import { playComplete, setSoundEnabled, soundEnabled } from '$lib/sound';

	// Eintrag im Benutzermenü; wird erst beim Öffnen im Browser gerendert
	let on = $state(soundEnabled());
</script>

<DropdownMenu.CheckboxItem
	bind:checked={on}
	closeOnSelect={false}
	onCheckedChange={(next) => {
		setSoundEnabled(next);
		// Zur Probe abspielen, damit man hört, was man eingeschaltet hat
		if (next) playComplete();
	}}
>
	{m.sound_on_complete()}
</DropdownMenu.CheckboxItem>
