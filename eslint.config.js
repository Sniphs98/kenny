import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
	{ linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' } },
	{
		ignores: [
			'src/lib/paraglide/**',
			'project.inlang/cache/**',
			'.svelte-kit/**',
			'build/**',
			'data/**',
			'coverage/**',
			'playwright/**',
			'test-results/**',
			'playwright-report/**',
			'src/lib/components/ui/**'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// Kenny is served at the origin root; base-path deployments are not supported yet.
			'svelte/no-navigation-without-resolve': 'off',
			// Editable local copies and derived collections deliberately use state and ordinary maps.
			'svelte/prefer-writable-derived': 'off',
			'svelte/prefer-svelte-reactivity': 'off',
			// Accessibility suppressions are checked by svelte-check against the compiler itself.
			'svelte/no-unused-svelte-ignore': 'off',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/ban-ts-comment': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
		}
	},
	{ files: ['**/*.svelte'], languageOptions: { globals: { App: 'readonly' }, parserOptions: { parser: ts.parser } } },
	{
		files: ['src/lib/contracts/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: ['$lib/server', '$lib/server/**', '**/server/**', 'node:*', 'svelte', 'svelte/*', '@sveltejs/*'] }
			]
		}
	},
	{
		files: ['src/**/*.svelte', 'src/lib/*.ts', 'src/routes/**/+page.ts', 'src/routes/**/+layout.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						'$lib/server',
						'$lib/server/**',
						'**/server/**',
						'node:*',
						'better-sqlite3',
						'drizzle-orm',
						'drizzle-orm/*'
					]
				}
			]
		}
	},
	{
		files: ['src/lib/server/services/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: ['svelte', 'svelte/*', '$lib/components/**', '$app/navigation', '$app/state'] }
			]
		}
	}
);
