import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E-Tests gegen den gebauten Node-Server mit separater Datenbank unter data/test,
 * die vor jedem Lauf frisch angelegt wird. Die Entwicklungsdaten bleiben unberührt.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	workers: 2,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		locale: 'de-DE',
		timezoneId: 'Europe/Berlin',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1600, height: 1000 },
				storageState: 'playwright/.auth/user.json'
			},
			dependencies: ['setup']
		}
	],
	webServer: {
		command: `node -e "require('fs').rmSync('data/test',{recursive:true,force:true})" && node build`,
		url: `${baseURL}/login`,
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			PORT: String(PORT),
			HOST: '127.0.0.1',
			ORIGIN: baseURL,
			BODY_SIZE_LIMIT: '30M',
			DATABASE_URL: 'data/test/kenny.db',
			ATTACHMENTS_DIR: 'data/test/attachments',
			BETTER_AUTH_URL: baseURL,
			BETTER_AUTH_SECRET: 'e2e-test-secret-nur-fuer-playwright-0123456789'
		}
	}
});
