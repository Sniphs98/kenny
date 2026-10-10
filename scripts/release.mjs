// Nächste Version und Release-Notizen aus Conventional Commits seit dem letzten Versions-Tag.
// Aufruf im Release-Workflow:  node scripts/release.mjs <notes-file> [tag]
// Ohne Tag wird die Version berechnet; mit Tag (manuelles Release) gelten dessen Version und Notizen.
// Schreibt release (true/false), version, tag und prerelease nach $GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ subject: string; body?: string }} Commit
 * @typedef {{ type: string; scope: string | null; breaking: boolean; description: string }} ParsedCommit
 * @typedef {'major' | 'minor' | 'patch' | null} Bump
 */

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const HEADER = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

/** @param {string | null | undefined} tag */
export function parseVersion(tag) {
	const m = SEMVER.exec(tag ?? '');
	return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null } : null;
}

/**
 * Commit-Kopf und -Text auswerten; null bei Commits ohne Conventional-Format
 * @param {Commit} commit
 * @returns {ParsedCommit | null}
 */
export function parseCommit({ subject, body = '' }) {
	const m = HEADER.exec(subject.trim());
	if (!m) return null;
	return {
		type: m[1].toLowerCase(),
		scope: m[2] || null,
		breaking: !!m[3] || /^BREAKING[ -]CHANGE:/m.test(body),
		description: m[4].trim()
	};
}

/** @param {Commit[]} commits */
const parseAll = (commits) => /** @type {ParsedCommit[]} */ (commits.map(parseCommit).filter(Boolean));

/**
 * Art der Erhöhung; null heißt: kein Release
 * @param {Commit[]} commits
 * @returns {Bump}
 */
export function bumpFor(commits) {
	const parsed = parseAll(commits);
	if (parsed.some((c) => c.breaking)) return 'major';
	if (parsed.some((c) => c.type === 'feat')) return 'minor';
	if (parsed.some((c) => c.type === 'fix' || c.type === 'perf')) return 'patch';
	return null;
}

/**
 * Vor 1.0 gilt ein Breaking Change als Minor-Erhöhung (0.x ist noch nicht stabil)
 * @param {string | null} previous
 * @param {Bump} bump
 */
export function nextVersion(previous, bump) {
	const v = parseVersion(previous) ?? { major: 0, minor: 0, patch: 0 };
	if (bump === 'major' && v.major > 0) return `${v.major + 1}.0.0`;
	if (bump === 'major' || bump === 'minor') return `${v.major}.${v.minor + 1}.0`;
	if (bump === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
	return null;
}

/**
 * Release-Notizen in Markdown, gruppiert nach Art der Änderung
 * @param {Commit[]} commits
 * @param {{ previous?: string | null; tag?: string; repository?: string }} [options]
 */
export function releaseNotes(commits, { previous, tag, repository } = {}) {
	/** @type {[string, (c: ParsedCommit) => boolean][]} */
	const sections = [
		['Breaking changes', (c) => c.breaking],
		['Features', (c) => c.type === 'feat' && !c.breaking],
		['Fixes', (c) => (c.type === 'fix' || c.type === 'perf') && !c.breaking]
	];
	const parsed = parseAll(commits);
	/** @param {ParsedCommit} c */
	const line = (c) => {
		const text = c.description.replace(/\(#(\d+)\)\s*$/, (_, n) =>
			repository ? `([#${n}](https://github.com/${repository}/pull/${n}))` : `(#${n})`
		);
		return `- ${c.scope ? `**${c.scope}:** ` : ''}${text}`;
	};
	const parts = sections
		.map(([title, match]) => /** @type {[string, ParsedCommit[]]} */ ([title, parsed.filter(match)]))
		.filter(([, list]) => list.length)
		.map(([title, list]) => `## ${title}\n\n${list.map(line).join('\n')}`);
	if (previous && tag && repository)
		parts.push(`**Full changelog:** https://github.com/${repository}/compare/${previous}...${tag}`);
	return parts.join('\n\n') + '\n';
}

// --- Git und GitHub Actions -----------------------------------------------------------------

/** @param {string[]} args */
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * Letzter Versions-Tag, der in HEAD enthalten ist (ohne den gerade veröffentlichten Tag selbst)
 * @param {string | undefined} exclude
 */
function previousTag(exclude) {
	const tags = git('tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean);
	return tags.find((t) => t !== exclude && parseVersion(t)) ?? null;
}

/**
 * @param {string | null} tag
 * @returns {Commit[]}
 */
function commitsSince(tag) {
	const log = git('log', '--format=%s%x1f%b%x1e', tag ? `${tag}..HEAD` : 'HEAD');
	return log
		.split('\x1e')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [subject, body = ''] = entry.split('\x1f');
			return { subject, body };
		});
}

/** @param {string[]} args */
function main([notesFile, manualTag]) {
	/** @param {string} key @param {string} value */
	const output = (key, value) => {
		if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
		console.log(`${key}=${value}`);
	};
	const previous = previousTag(manualTag);
	const commits = commitsSince(previous);
	let version;
	if (manualTag) {
		if (!manualTag.startsWith('v') || !parseVersion(manualTag)) throw new Error(`Invalid release tag: ${manualTag}`);
		version = manualTag.slice(1);
	} else {
		version = nextVersion(previous, bumpFor(commits));
	}
	if (!version) {
		console.log(`No feat/fix/perf commits since ${previous ?? 'the beginning'}: no release.`);
		output('release', 'false');
		return;
	}
	writeFileSync(
		notesFile,
		releaseNotes(commits, { previous, tag: `v${version}`, repository: process.env.GITHUB_REPOSITORY })
	);
	output('release', 'true');
	output('version', version);
	output('tag', `v${version}`);
	output('prerelease', String(!!parseVersion(version)?.pre));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
