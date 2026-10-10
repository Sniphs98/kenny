import { describe, expect, it } from 'vitest';
import { bumpFor, imageFromEnv, nextVersion, parseCommit, releaseNotes } from '../../scripts/release.mjs';

const c = (subject: string, body = '') => ({ subject, body });

describe('release versions', () => {
	it('reads conventional commit headers', () => {
		expect(parseCommit(c('feat(teams): run Kenny in Teams (#46)'))).toEqual({
			type: 'feat',
			scope: 'teams',
			breaking: false,
			description: 'run Kenny in Teams (#46)'
		});
		expect(parseCommit(c('fix!: drop old API'))?.breaking).toBe(true);
		expect(parseCommit(c('refactor: x', 'BREAKING CHANGE: removes /api/v0'))?.breaking).toBe(true);
		expect(parseCommit(c('Merge branch main'))).toBeNull();
	});

	it('derives the bump from the most significant change', () => {
		expect(bumpFor([c('docs: readme'), c('fix: a'), c('feat(x): b')])).toBe('minor');
		expect(bumpFor([c('fix: a'), c('perf: b')])).toBe('patch');
		expect(bumpFor([c('feat: a'), c('chore!: drop node 20')])).toBe('major');
		// Kein Release für reine Wartung
		expect(bumpFor([c('docs: a'), c('test: b'), c('ci: c'), c('chore(deps): d'), c('Merge pull request')])).toBeNull();
	});

	it('counts versions up from the previous tag', () => {
		expect(nextVersion('v0.1.0', 'minor')).toBe('0.2.0');
		expect(nextVersion('v0.2.3', 'patch')).toBe('0.2.4');
		// Vor 1.0 bleibt ein Breaking Change eine Minor-Erhöhung
		expect(nextVersion('v0.9.1', 'major')).toBe('0.10.0');
		expect(nextVersion('v1.4.2', 'major')).toBe('2.0.0');
		expect(nextVersion('v1.4.2', 'minor')).toBe('1.5.0');
		expect(nextVersion(null, 'patch')).toBe('0.0.1');
		expect(nextVersion('v1.0.0', null)).toBeNull();
	});
});

describe('release notes', () => {
	it('groups changes and links pull requests', () => {
		const notes = releaseNotes(
			[
				c('feat(teams): run Kenny in Teams (#46)'),
				c('fix: keep cards visible (#15)'),
				c('docs: update readme (#50)'),
				c('feat!: new storage layout')
			],
			{ previous: 'v0.1.0', tag: 'v0.2.0', repository: 'Sniphs98/kenny' }
		);
		expect(notes).toBe(
			[
				'## Breaking changes',
				'',
				'- new storage layout',
				'',
				'## Features',
				'',
				'- **teams:** run Kenny in Teams ([#46](https://github.com/Sniphs98/kenny/pull/46))',
				'',
				'## Fixes',
				'',
				'- keep cards visible ([#15](https://github.com/Sniphs98/kenny/pull/15))',
				'',
				'**Full changelog:** https://github.com/Sniphs98/kenny/compare/v0.1.0...v0.2.0',
				''
			].join('\n')
		);
	});

	it('names the published Docker image first', () => {
		const digest = `sha256:${'a1'.repeat(32)}`;
		const notes = releaseNotes([c('fix: keep cards visible (#15)')], {
			previous: 'v0.2.0',
			tag: 'v0.2.1',
			repository: 'Sniphs98/kenny',
			image: { name: 'ghcr.io/sniphs98/kenny', digest }
		});
		const fence = '```';
		expect(notes).toContain(
			[
				'## Docker image',
				'',
				`${fence}sh`,
				'docker pull ghcr.io/sniphs98/kenny:0.2.1',
				fence,
				'',
				`Digest: \`${digest}\` · [Package on GitHub](https://github.com/Sniphs98/kenny/pkgs/container/kenny)`,
				'',
				'## Fixes'
			].join('\n')
		);
		expect(notes.startsWith('## Docker image')).toBe(true);
	});

	it('only accepts valid image names and digests from the workflow', () => {
		expect(imageFromEnv({})).toBeUndefined();
		expect(imageFromEnv({ RELEASE_IMAGE: 'ghcr.io/sniphs98/kenny' })).toEqual({
			name: 'ghcr.io/sniphs98/kenny',
			digest: undefined
		});
		expect(() => imageFromEnv({ RELEASE_IMAGE: 'ghcr.io/x/y; rm -rf /' })).toThrow(/Invalid image name/);
		expect(() => imageFromEnv({ RELEASE_IMAGE: 'ghcr.io/x/y', RELEASE_IMAGE_DIGEST: 'sha256:`whoami`' })).toThrow(
			/Invalid image digest/
		);
	});
});
