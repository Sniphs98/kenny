# Contributing to Kenny

## Setup

Use the Node.js version in `.nvmrc`, then run `npm ci`. For development, copy `.env.example` to `.env` and set your own `BETTER_AUTH_SECRET`. Start the app with `npm run dev`. See `AGENTS.md` for architecture and development rules.

Text files use LF line endings; `.gitattributes` enforces this even with `core.autocrlf=true` on Windows. A checkout made before that file existed may still contain CRLF files: run `npm run format` once (only line endings change, `git status` stays clean).

## Issue → branch → pull request

1. Describe the bug or feature using the appropriate issue form. Include acceptance criteria and any impact on existing data.
2. Create a branch such as `feat/ticket-filter` or `fix/date-validation`.
3. Implement behavior in the services, update Zod contracts and the typed client, and add relevant tests.
4. Run the checks and open a PR against `main`. Link the issue with `Closes #123`.
5. Wait for CI and review, then squash merge.

PR titles follow Conventional Commits, for example `feat(tickets): add filtering` or `fix(api): reject invalid dates`. A GitHub Action validates the title.

## Verification commands

| Command                                       | Purpose                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run verify`                              | Guard, formatting, lint, types, unit/service/migration tests, and build |
| `npm run format`                              | Apply formatting                                                        |
| `npm test`                                    | Fast unit tests                                                         |
| `npm run test:integration`                    | Services with real SQLite and migration upgrades                        |
| `npm run test:ci`                             | All unit/integration tests with enforced coverage thresholds            |
| `npm run test:coverage`                       | Coverage report under `coverage/`                                       |
| `npm run test:e2e:production`                 | Build and Playwright tests against the Node production server           |
| `npm run docker:build && npm run docker:test` | Container login, API, uploads, and persistence after restart            |

Run `npx playwright install chromium` once. E2E tests delete only `data/test`, start their own server on port 4174, and use a dedicated test user. Vitest uses an in-memory database. Docker tests create their own container and volume and remove both afterward.

Coverage thresholds protect the baseline: 60% lines and 50% each for statements, branches, and functions. Shared contracts require 100% lines, statements, and functions, and 80% branches. This coverage applies to Vitest, not browser or container tests.

Bug fixes need a regression test. New business rules need positive and negative test cases; API changes need corresponding HTTP tests. Investigate failed tests instead of removing them or weakening the checks.

Generated UI primitives under `src/lib/components/ui/` are excluded from formatting and ESLint, but remain covered by type checking. Review changes to these components carefully.

## GitHub configuration

The repository includes workflows and templates. `.github/rulesets/main.json` also contains an importable ruleset for a solo repository without mandatory reviews by another person. Import it in GitHub or activate it through the API; the file alone does not enable branch protection. After pushing, configure the repository settings:

- Ruleset for `main`: require pull requests, successful `Quality checks`, `Production E2E`, `Docker smoke test`, and `Conventional PR title` checks, and an up-to-date branch before merging; prohibit force pushes and branch deletion.
- Require at least one review once another contributor can review, and dismiss stale reviews after new changes. Do not impose an impossible external-review requirement on a solo repository.
- Use squash merging with the PR title as the commit title.
- Enable Dependabot alerts and any available secret scanning and push protection.
- If needed, make the GHCR package public after the first release. A public repository does not automatically make a new package public.

CI runs without production secrets. `npm audit --audit-level=high` blocks high and critical advisories. Lower-severity findings remain visible and should be addressed through dependency PRs. The local repository hygiene guard complements secret scanning; it does not replace a full secret scanner.

## Docker releases

Every push to `main` starts the release workflow. It runs the complete CI, including the container, and derives the next version from the Conventional Commits since the last `v*` tag (with squash merges, these are the PR titles):

| Commits since the last release                                        | Next version                           |
| --------------------------------------------------------------------- | -------------------------------------- |
| Breaking change (`feat!:`, `fix!:` or `BREAKING CHANGE:` in the body) | major; while Kenny is below 1.0: minor |
| at least one `feat`                                                   | minor, e.g. `0.1.0` → `0.2.0`          |
| at least one `fix` or `perf`                                          | patch, e.g. `0.2.0` → `0.2.1`          |
| only `docs`, `test`, `ci`, `chore`, `refactor`, …                     | no release                             |

It then publishes `ghcr.io/sniphs98/kenny:<version>` with a commit tag and creates the `v<version>` tag and a GitHub release with grouped release notes. Stable releases also receive `latest`; prereleases do not. Linux amd64 is currently supported.

To release a specific version, for example a prerelease, push a tag such as `v1.0.0-rc.1` on a commit in `main`; the workflow publishes exactly that version.

A manually triggered release workflow builds and tests without publishing. To roll back, use a previous container tag or digest. Back up the database and attachments first; rolling back an image does not reverse applied database migrations.

There is no automatic production deployment. UI messages use ParaglideJS; add new messages to `messages/de.json` and `messages/en.json`. Schema and API field names, as well as user-created content, remain independent of the UI language.
