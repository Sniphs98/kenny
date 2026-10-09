import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
	encoding: 'utf8'
})
	.split('\0')
	.filter(Boolean);
const violations = [];
for (const path of new Set(paths)) {
	const name = basename(path);
	if (/^\.env(?:\.|$)/i.test(name) && name !== '.env.example') violations.push(`${path}: environment file`);
	if (/\.(p12|pfx|key|db|sqlite|sqlite3)(?:-(?:wal|shm))?$/i.test(name))
		violations.push(`${path}: secret or database file`);
	if (
		/^(?:data|build|node_modules|\.svelte-kit|playwright\/\.auth|coverage|test-results|playwright-report)\//.test(path)
	)
		violations.push(`${path}: generated/private artifact`);
	let contents;
	try {
		const metadata = lstatSync(path);
		if (metadata.isSymbolicLink()) {
			violations.push(`${path}: symlink must be reviewed instead of followed by the guard`);
			continue;
		}
		if (!metadata.isFile() || fileURLToPath(new URL(`../${path}`, import.meta.url)) === self) continue;
		contents = readFileSync(path, 'utf8');
	} catch (error) {
		// Deleted files may still be in the index.
		if (error.code !== 'ENOENT') violations.push(`${path}: unable to inspect file`);
		continue;
	}
	if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(contents)) violations.push(`${path}: private key material`);
	if (/\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}|AKIA[A-Z0-9]{16})\b/.test(contents))
		violations.push(`${path}: access credential`);
}
if (violations.length) {
	console.error(`Repository guard failed:\n${violations.join('\n')}`);
	process.exit(1);
}
console.log('Repository guard passed.');
