import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const guard = resolve('scripts/hygiene-guard.mjs');
function fixture(run: (directory: string) => void) {
	const directory = mkdtempSync(join(tmpdir(), 'kenny-guard-'));
	try {
		execFileSync('git', ['init', '--quiet', directory]);
		run(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
it('allows instruction files and the example environment, blocks actual environment files', () => {
	fixture((cwd) => {
		writeFileSync(join(cwd, 'AGENTS.md'), 'Project instructions');
		writeFileSync(join(cwd, '.env.example'), 'BETTER_AUTH_SECRET=placeholder');
		expect(spawnSync(process.execPath, [guard], { cwd }).status).toBe(0);
		writeFileSync(join(cwd, '.env.production'), 'SECRET=private');
		expect(spawnSync(process.execPath, [guard], { cwd }).status).toBe(1);
	});
});
it('detects embedded private keys even in ordinary source files', () => {
	fixture((cwd) => {
		writeFileSync(join(cwd, 'accidental.ts'), ['-----BEGIN', 'OPENSSH', 'PRIVATE', 'KEY-----'].join(' '));
		expect(spawnSync(process.execPath, [guard], { cwd }).status).toBe(1);
	});
});
it('fails when invoked outside a git repository', () => {
	const cwd = mkdtempSync(join(tmpdir(), 'kenny-no-git-'));
	try {
		expect(spawnSync(process.execPath, [guard], { cwd }).status).not.toBe(0);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
