<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, isLocale, setLocale } from '$lib/paraglide/runtime.js';
</script>

<label class="flex items-center gap-2 text-sm">
	<span class="sr-only">{m.language()}</span>
	<select
		class="bg-background rounded-md border px-2 py-1.5"
		value={getLocale()}
		onchange={(event) => {
			const locale = event.currentTarget.value;
			if (isLocale(locale)) setLocale(locale);
		}}
	>
		<option value="de">{m.language_de()}</option>
		<option value="en">{m.language_en()}</option>
	</select>
</label>
