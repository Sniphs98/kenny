import { untrack } from 'svelte';

/**
 * Lokale, bearbeitbare Kopie eines Werts vom Server (z. B. Titel in einem Eingabefeld).
 * Neue Server-Werte (etwa durch Live-Updates) werden nur übernommen, solange der Wert
 * nicht lokal geändert wurde – ungespeicherte Eingaben gehen so nicht verloren.
 *
 *   const title = new Synced(data.ticket.title);
 *   $effect(() => title.update(data.ticket.title));
 *   <input bind:value={title.value} />
 */
export class Synced<T> {
	value = $state() as T;
	#base: T;

	constructor(initial: T) {
		this.value = initial;
		this.#base = initial;
	}

	/** Neuen Server-Wert melden */
	update(next: T) {
		untrack(() => {
			if (this.value === this.#base) this.value = next;
			this.#base = next;
		});
	}

	/** Lokal geändert und noch nicht gespeichert? */
	get dirty() {
		return this.value !== this.#base;
	}

	/** Lokale Änderung verwerfen */
	reset() {
		this.value = this.#base;
	}
}
