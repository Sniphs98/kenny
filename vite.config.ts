import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			// Eigene Wahl (src/lib/locale-choice.ts) → Systemsprache (Accept-Language/navigator) → Englisch
			strategy: ['custom-choice', 'preferredLanguage', 'baseLocale']
		}),
		tailwindcss(),
		sveltekit()
	]
});
