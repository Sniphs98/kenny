import { defineConfig, devices } from '@playwright/test';
import { TEAMS_E2E } from './tests/e2e/teams-env';

const PORT = 4174;
const baseURL = `http://localhost:${PORT}`;
const subpathURL = 'http://localhost:4177';

/**
 * E2E-Tests gegen den gebauten Node-Server mit separater Datenbank unter data/test,
 * die vor jedem Lauf frisch angelegt wird. Die Entwicklungsdaten bleiben unberührt.
 * Die Unterpfad-Tests verwenden denselben Build unter /kenny mit data/test-subpath.
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
			testIgnore: /(mobile|teams|subpath|microsoft-account)\.spec\.ts/,
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
			name: 'subpath-chromium',
			testMatch: /subpath\.spec\.ts/,
			use: { ...devices['Desktop Chrome'], baseURL: subpathURL, viewport: { width: 1600, height: 1000 } }
		},
		{
			name: 'microsoft-chromium',
			testMatch: /microsoft-account\.spec\.ts/,
			use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4178', viewport: { width: 1400, height: 1000 } }
		},
		{
			name: 'teams',
			testMatch: /teams\.spec\.ts/,
			use: { ...devices['Desktop Chrome'], baseURL: TEAMS_E2E.url, viewport: { width: 1400, height: 900 } }
		}
	],
	webServer: [
		{
			command: `node -e "require('fs').rmSync('data/test-microsoft',{recursive:true,force:true})" && node scripts/start-server.mjs`,
			url: 'http://localhost:4178/kenny/login',
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				PORT: '4178',
				HOST: '127.0.0.1',
				ORIGIN: 'http://localhost:4178',
				BASE_PATH: '/kenny',
				DATABASE_URL: 'data/test-microsoft/kenny.db',
				ATTACHMENTS_DIR: 'data/test-microsoft/attachments',
				BETTER_AUTH_URL: 'http://localhost:4178',
				BETTER_AUTH_SECRET: 'e2e-microsoft-secret-only-for-tests-0123456789',
				MICROSOFT_CLIENT_ID: TEAMS_E2E.clientId,
				MICROSOFT_CLIENT_SECRET: 'e2e-not-a-secret',
				MICROSOFT_TENANT_ID: TEAMS_E2E.tenant,
				MICROSOFT_AUTHORITY: TEAMS_E2E.authority,
				TEAMS_ENABLED: 'false',
				SMTP_USER: '',
				SMTP_PASSWORD: ''
			}
		},
		{
			command: `node -e "require('fs').rmSync('data/test-subpath',{recursive:true,force:true})" && node scripts/start-server.mjs`,
			url: `${subpathURL}/kenny/login`,
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				PORT: '4177',
				HOST: '127.0.0.1',
				ORIGIN: subpathURL,
				BASE_PATH: '/kenny',
				DATABASE_URL: 'data/test-subpath/kenny.db',
				ATTACHMENTS_DIR: 'data/test-subpath/attachments',
				BETTER_AUTH_URL: subpathURL,
				BETTER_AUTH_SECRET: 'e2e-subpath-secret-nur-fuer-playwright-0123456789'
			}
		},
		{
			command: `node -e "require('fs').rmSync('data/test',{recursive:true,force:true})" && node scripts/start-server.mjs`,
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
			command: `node -e "require('fs').rmSync('data/test-teams',{recursive:true,force:true})" && node scripts/start-server.mjs`,
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
