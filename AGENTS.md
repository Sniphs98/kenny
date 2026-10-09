# Working on Kenny

Kenny is a SvelteKit/Svelte 5 application with a Node server, SQLite, Drizzle and Better Auth. Read `CONTRIBUTING.md` and `README.md` before changing behavior.

## Architecture and contracts

- `src/lib/contracts/`: shared Zod schemas and inferred DTO/input types. No framework, database or server imports.
- `src/lib/server/services/`: business rules, transactions and persistence. Both API routes and form actions call these services; validate unknown input here with `parseInput`.
- `src/routes/api/v1/`: transport and authentication; use `apiHandler` and `readJson`. Do not implement business rules in routes.
- Browser code must not import server modules, even for types. Use shared contracts. Use typed commands from `src/lib/api.ts` for project and ticket mutations; never assert an HTTP response with `as T`.
- Forms use Superforms and shared Zod schemas. Validate on the server even when the browser validates. Keep form defaults separate from PATCH schemas: absent fields mean unchanged, explicit null means clear.
- Keep public DTOs explicit. Never expose token hashes, storage keys or authentication records.
- Database changes need a generated, committed migration. Never rewrite an applied migration or use `db:push` to replace migration history.
- Keep multi-step writes atomic. Preserve cycle prevention, project-scoped parent/column/tag references and date-range checks.

## Changes and verification

- Start from the issue's acceptance criteria. Keep changes scoped, link the issue in the PR and describe any remaining limitation.
- Add regression tests for bug fixes. Test business rules with real isolated SQLite; mock only external boundaries.
- Run `npm run verify` before completion. For UI/API changes run `npm run test:e2e:production`; for runtime/container changes build the image and run `npm run docker:test`.
- Never weaken existing checks, delete failing tests, add `any` or disable type checking to make a change pass. Explain an actual infrastructure limitation instead.
- Tests must not read development/production databases or secrets. Use dedicated test fixtures, in-memory databases and disposable containers/volumes.
- Never commit `.env`, database files, uploaded files, session cookies, private keys, build outputs or test reports. `.env.example` contains placeholders only.
- Changes to CI must preserve pinned action commits, minimal permissions, untrusted PR isolation and the full release test gate. Do not interpolate issue/PR content directly into shell code.
- Releases are Docker images on GHCR, triggered by semantic version tags on commits in `main`. No npm package or automatic production deployment.
- UI messages use ParaglideJS. Add messages to both `messages/de.json` and `messages/en.json`; keep stable schema/field identifiers and user content separate from translated text. Generated `src/lib/paraglide/` files must not be committed.
