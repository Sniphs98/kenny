import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
	resolve: {
		alias: {
			$lib: file('./src/lib'),
			'$env/dynamic/private': file('./tests/fixtures/env.ts'),
			'$app/environment': file('./tests/fixtures/environment.ts')
		}
	},
	test: {
		setupFiles: ['tests/fixtures/setup.ts'],
		projects: [
			{ extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
			{ extends: true, test: { name: 'integration', environment: 'node', include: ['tests/integration/**/*.test.ts'] } }
		],
		coverage: {
			provider: 'v8',
			include: ['src/lib/contracts/**/*.ts', 'src/lib/server/services/**/*.ts', 'src/lib/server/validation.ts'],
			reporter: ['text', 'html', 'lcov'],
			thresholds: {
				lines: 60,
				statements: 50,
				branches: 50,
				functions: 50,
				'src/lib/contracts/**': { lines: 100, statements: 100, functions: 100, branches: 80 }
			}
		}
	}
});
