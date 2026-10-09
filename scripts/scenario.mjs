// @ts-check
// Startet den Dev-Server mit einer eigenen Datenbank pro Szenario und befüllt sie beim ersten Start.
//
//   npm run dev:scenario -- list
//   npm run dev:scenario -- demo
//   npm run dev:scenario -- demo --reset      Szenario frisch neu erzeugen
//   npm run dev:scenario -- demo --port 5180
//
// Die normale Entwicklungsdatenbank (data/kenny.db) wird nie angefasst.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCENARIO_PASSWORD, seedScenario } from './scenario-seed.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const scenarioDir = join(root, 'scenarios');

/** @param {string} message */
function fail(message) {
	console.error(`\n✖ ${message}\n`);
	process.exit(1);
}

if (process.env.NODE_ENV === 'production')
	fail('Szenarien sind nur für die Entwicklung gedacht (NODE_ENV=production).');

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const reset = args.includes('--reset');
const portArg = args.indexOf('--port');
const port = Number(portArg >= 0 ? args[portArg + 1] : (process.env.PORT ?? 5173));

const available = readdirSync(scenarioDir)
	.filter((f) => f.endsWith('.mjs'))
	.map((f) => f.slice(0, -4))
	.sort();

/** @param {string} id @returns {Promise<import('./scenario-seed.mjs').Scenario>} */
const load = async (id) => (await import(pathToFileURL(join(scenarioDir, `${id}.mjs`)).href)).default;

if (!name || name === 'list') {
	console.log('\nVerfügbare Szenarien:\n');
	for (const id of available) console.log(`  ${id.padEnd(12)} ${(await load(id)).description}`);
	console.log('\nStarten mit: npm run dev:scenario -- <name> [--reset]\n');
	process.exit(0);
}
if (!available.includes(name)) fail(`Unbekanntes Szenario "${name}". Verfügbar: ${available.join(', ')}`);
if (!Number.isInteger(port) || port <= 0) fail('Ungültiger Port.');

const scenario = await load(name);
const dir = join(root, 'data', 'scenarios', name);
const marker = join(dir, 'seeded');
if (reset || !existsSync(marker)) rmSync(dir, { recursive: true, force: true });
const needsSeed = !existsSync(marker);
mkdirSync(dir, { recursive: true });

// Eigenes Secret pro Szenario, damit Anmeldungen Neustarts überleben und keine .env nötig ist
const secretFile = join(dir, 'auth-secret');
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('base64'));
const url = `http://localhost:${port}`;

const server = spawn(
	process.execPath,
	[join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--port', String(port), '--strictPort'],
	{
		cwd: root,
		stdio: 'inherit',
		env: {
			...process.env,
			DATABASE_URL: join(dir, 'kenny.db'),
			ATTACHMENTS_DIR: join(dir, 'attachments'),
			BETTER_AUTH_SECRET: readFileSync(secretFile, 'utf8'),
			BETTER_AUTH_URL: url
		}
	}
);
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) process.on(signal, () => server.kill(signal));

const login = scenario.users[0];
const credentials = login ? `Anmelden mit ${login.email} / ${SCENARIO_PASSWORD}` : '';

if (!needsSeed) {
	console.log(`\nSzenario „${name}“ (bestehende Daten). ${credentials}\n`);
} else {
	try {
		await waitFor(`${url}/login`);
		console.log(`\nBefülle Szenario „${name}“ …`);
		const result = await seedScenario(url, scenario, { log: (m) => console.log(`  ${m}`) });
		writeFileSync(marker, new Date().toISOString());
		console.log(`\n✔ Szenario „${name}“ bereit: ${result.projects} Projekte, ${result.tickets} Tickets.`);
		console.log(`  ${url}  ·  ${credentials}\n`);
	} catch (error) {
		server.kill();
		rmSync(dir, { recursive: true, force: true });
		fail(`Befüllen fehlgeschlagen, Szenario wurde verworfen:\n${error instanceof Error ? error.message : error}`);
	}
}

/** Wartet, bis der Dev-Server antwortet @param {string} target */
async function waitFor(target, timeout = 120_000) {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		try {
			if ((await fetch(target)).ok) return;
		} catch {
			// Server startet noch
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Dev-Server unter ${target} antwortet nicht.`);
}
