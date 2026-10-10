// Ticketsuche: Suchwörter, Treffer markieren und Textausschnitte (Server und Browser)

/** Suchbegriff in kleingeschriebene Wörter zerlegen; doppelte entfallen */
export function searchTokens(query: string) {
	return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
}

/** Ein Textstück mit Kennzeichen, ob es ein Suchwort ist (zum Hervorheben ohne HTML) */
export type Part = { text: string; hit: boolean };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text in Stücke zerlegen und Vorkommen der Suchwörter kennzeichnen (Groß-/Kleinschreibung egal) */
export function highlight(text: string, tokens: string[]): Part[] {
	if (!tokens.length || !text) return text ? [{ text, hit: false }] : [];
	// Längere Wörter zuerst, damit „login“ vor „log“ gewinnt
	const pattern = new RegExp(
		`(${[...tokens]
			.sort((a, b) => b.length - a.length)
			.map(escape)
			.join('|')})`,
		'gi'
	);
	return text
		.split(pattern)
		.filter(Boolean)
		.map((part) => ({ text: part, hit: tokens.includes(part.toLowerCase()) }));
}

/**
 * Ausschnitt um das erste Suchwort im Text (z.B. der Beschreibung), auf radius Zeichen je Seite gekürzt,
 * mit „…“ an abgeschnittenen Enden. null, wenn kein Suchwort vorkommt.
 */
export function snippet(text: string, tokens: string[], radius = 40): Part[] | null {
	const flat = text.replace(/\s+/g, ' ').trim();
	const lower = flat.toLowerCase();
	const positions = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
	if (!positions.length) return null;
	const at = Math.min(...positions);
	let start = Math.max(0, at - radius);
	let end = Math.min(flat.length, at + radius * 2);
	// An Wortgrenzen schneiden, damit keine halben Wörter am Rand stehen
	if (start > 0) start = flat.indexOf(' ', start) + 1 || start;
	if (end < flat.length) end = flat.lastIndexOf(' ', end) > at ? flat.lastIndexOf(' ', end) : end;
	const parts = highlight(flat.slice(start, end), tokens);
	if (start > 0) parts.unshift({ text: '… ', hit: false });
	if (end < flat.length) parts.push({ text: ' …', hit: false });
	return parts;
}
