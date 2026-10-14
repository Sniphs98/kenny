import type { Attachment } from 'svelte/attachments';

/**
 * Textfeld wächst mit seinem Inhalt, statt zu scrollen oder Text abzuschneiden.
 * `value` liest den gebundenen Wert, damit auch Änderungen von außen (Live-Updates) die Höhe anpassen.
 *
 *   <textarea bind:value={text} {@attach autosize(() => text)}></textarea>
 */
export function autosize(value: () => unknown): Attachment<HTMLTextAreaElement> {
	return (el) => {
		value();
		const fit = () => {
			el.style.height = 'auto';
			el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
		};
		fit();
		el.addEventListener('input', fit);
		// Bei anderer Breite (Fenster, Modal, Schriftart geladen) umbrechen sich die Zeilen neu
		let width = el.clientWidth;
		const observer = new ResizeObserver(() => {
			if (el.clientWidth === width) return;
			width = el.clientWidth;
			fit();
		});
		observer.observe(el);
		return () => {
			el.removeEventListener('input', fit);
			observer.disconnect();
		};
	};
}
