// Einbettungscode für Formulare (iframe auf fremden Webseiten)

/** Nachricht der eingebetteten Seite an die Webseite drumherum: { type, height } */
export const EMBED_RESIZE_MESSAGE = 'kenny:resize';

const escapeAttr = (v: string) =>
	v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * HTML zum Einfügen in eine eigene Webseite. Das Skript passt die Höhe des iframes an
 * und nimmt nur Nachrichten von Kenny selbst an.
 */
export function embedCode(origin: string, token: string, title: string) {
	const src = `${origin}/submit/${encodeURIComponent(token)}?embed`;
	return [
		`<iframe src="${escapeAttr(src)}" title="${escapeAttr(title)}" loading="lazy"`,
		`  style="display:block;width:100%;max-width:560px;height:640px;border:0"></iframe>`,
		`<script>`,
		`  addEventListener('message', function (e) {`,
		`    if (e.origin !== ${JSON.stringify(origin)} || !e.data || e.data.type !== '${EMBED_RESIZE_MESSAGE}') return;`,
		`    document.querySelectorAll('iframe').forEach(function (f) {`,
		`      if (f.contentWindow === e.source) f.style.height = e.data.height + 'px';`,
		`    });`,
		`  });`,
		`</script>`
	].join('\n');
}
