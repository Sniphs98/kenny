import { defineConfig, devices } from '@playwright/test';
import { TEAMS_E2E } from './tests/e2e/teams-env';

const PORT = 4174;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E-Tests gegen den gebauten Node-Server mit separater Datenbank unter data/test,
 * die vor jedem Lauf frisch angelegt wird. Die Entwicklungsdaten bleiben unberührt.
 * Die Teams-Tests laufen gegen eine zweite Instanz im Teams-Modus (data/test-teams).
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
			testIgnore: /(mobile|teams)\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1600, height: 1000 },
				storageState: 'playwright/.auth/user.json'
			},
			dependencies: ['setup']
		},
		{
			name: 'mobile-chromium',
			testMatch: /mobile\.spec\.ts/,
			use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, storageState: 'playwright/.auth/user.json' },
			dependencies: ['setup']
		},
		{
			name: 'teams',
			testMatch: /teams\.spec\.ts/,
			use: { ...devices['Desktop Chrome'], baseURL: TEAMS_E2E.url, viewport: { width: 1400, height: 900 } }
		}
	],
	webServer: [
		{
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
		},
		{
			command: 'node tests/fixtures/fake-entra.mjs',
			url: `${TEAMS_E2E.authority}/health`,
			reuseExistingServer: false,
			env: { FAKE_ENTRA_PORT: String(TEAMS_E2E.entraPort) }
		},
		{
			command: `node -e "require('fs').rmSync('data/test-teams',{recursive:true,force:true})" && node build`,
			url: `${TEAMS_E2E.url}/login`,
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				PORT: String(TEAMS_E2E.port),
				HOST: '127.0.0.1',
				ORIGIN: TEAMS_E2E.url,
				DATABASE_URL: 'data/test-teams/kenny.db',
				ATTACHMENTS_DIR: 'data/test-teams/attachments',
				BETTER_AUTH_URL: TEAMS_E2E.url,
				BETTER_AUTH_SECRET: 'e2e-teams-secret-nur-fuer-playwright-0123456789',
				TEAMS_ENABLED: 'true',
				MICROSOFT_CLIENT_ID: TEAMS_E2E.clientId,
				MICROSOFT_CLIENT_SECRET: 'e2e-not-a-secret',
				MICROSOFT_TENANT_ID: TEAMS_E2E.tenant,
				MICROSOFT_AUTHORITY: TEAMS_E2E.authority
			}
		}
	]
});
