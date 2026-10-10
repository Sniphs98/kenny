/**
 * Während und kurz nach dem Scrollen data-scrolling setzen. Damit zeigt .scrollbar-soft die
 * Scrollleiste auch beim Scrollen ohne Maus darüber (Tastatur, Touch, Mitscrollen beim Ziehen).
 */
export function scrollActivity(node: HTMLElement, hideAfterMs = 800) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const onScroll = () => {
		node.dataset.scrolling = '';
		clearTimeout(timer);
		timer = setTimeout(() => delete node.dataset.scrolling, hideAfterMs);
	};
	node.addEventListener('scroll', onScroll, { passive: true });
	return {
		destroy() {
			clearTimeout(timer);
			node.removeEventListener('scroll', onScroll);
		}
	};
}
