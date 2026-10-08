// Projektfarbe als Primärfarbe der Oberfläche

type RGB = [number, number, number];

function parseHex(color: string): RGB | null {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
	if (!m) return null;
	const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

const toHex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Relative Helligkeit nach WCAG (0 = schwarz, 1 = weiß) */
function luminance([r, g, b]: RGB) {
	const lin = (v: number) => {
		v /= 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const mix = (c: RGB, target: number, amount: number) => c.map((v) => v + (target - v) * amount) as RGB;

/** Weiß bevorzugt, Schwarz nur auf wirklich hellen Farben (Gelb, Hellgrün, Pastell) */
const textOn = (c: RGB) => (luminance(c) > 0.3 ? '#111111' : '#ffffff');

/**
 * CSS-Variablen, die --primary & Co. mit der Projektfarbe überschreiben.
 * Sehr helle Farben werden im Light Mode abgedunkelt, sehr dunkle im Dark Mode aufgehellt,
 * damit Links und Ränder auf dem Hintergrund sichtbar bleiben.
 */
export function accentVars(color: string | null | undefined): Record<string, string> {
	if (!color) return {};
	const rgb = parseHex(color);
	if (!rgb)
		return { '--primary': color, '--ring': color, '--primary-soft': `color-mix(in srgb, ${color} 12%, transparent)` };

	const lum = luminance(rgb);
	const light = lum > 0.45 ? mix(rgb, 0, 0.35) : rgb;
	const dark = lum < 0.2 ? mix(rgb, 255, 0.35) : rgb;
	return {
		'--primary': `light-dark(${toHex(light)}, ${toHex(dark)})`,
		'--primary-foreground': `light-dark(${textOn(light)}, ${textOn(dark)})`,
		'--primary-soft': `light-dark(${toHex(light)}1f, ${toHex(dark)}29)`,
		'--ring': `light-dark(${toHex(light)}, ${toHex(dark)})`
	};
}

/** Wie accentVars, aber als style-Attribut */
export const accentStyle = (color: string | null | undefined) =>
	Object.entries(accentVars(color))
		.map(([k, v]) => `${k}: ${v}`)
		.join('; ');
