import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

// Unterpfad hinter einem Reverse Proxy (z.B. /kenny); SvelteKit legt ihn beim Build fest
const basePath = process.env.BASE_PATH ?? '';

export default defineConfig({
	define: { __KENNY_BASE_PATH__: JSON.stringify(basePath) },
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			// Eigene Wahl (src/lib/locale-choice.ts) → Systemsprache (Accept-Language/navigator) → Englisch
			strategy: ['custom-choice', 'preferredLanguage', 'baseLocale']
		}),
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { runes: true },
			adapter: adapter(),
			paths: { base: basePath as '' | `/${string}` }
		})
	]
});
