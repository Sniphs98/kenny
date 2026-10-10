# Kenny – Boards, Zeitpläne und Tickets für Teams

Self-hosted project and ticket management with Kanban boards, Gantt timelines and submission forms. Kenny runs as a single Docker container with SQLite, so there is no separate database server to operate.

## Features

**Plan and track**

- **Projects** with their own key and color; tickets get identifiers such as `WEB-1`, `WEB-2`, …
- **Kanban boards** with configurable columns (including done and backlog columns), drag and drop, quick add per column, filters by search, tag and assignee, grouping by tag, assignee or priority, and sorting per board or per column
- **Gantt timeline** with start and due dates, draggable and resizable bars, dependency arrows, highlighted scheduling conflicts and a list of unscheduled tickets; also available as a collapsible timeline above the board
- **Tickets** with priority, assignee, dates, description, tags, **subtasks**, **links** (`depends on`, `blocks`, `related to`) with cycle prevention, and **attachments** (drag and drop, paste screenshots with Ctrl+V, image previews)
- **Create more:** keep the new-ticket dialog open to enter many tickets in a row

**Find and navigate**

- **Command palette** (Ctrl+K / ⌘K, or the search bar in the header): search tickets across all your projects by key, title or description, with highlighted matches and excerpts; create tickets, jump to boards, settings and admin pages, and switch the theme

**Work together**

- **Live updates:** boards, timelines and tickets refresh when someone else changes something; unsaved edits are kept
- **Accounts and roles:** email/password or Microsoft sign-in, instance administrators, and project roles (reader, member, project administrator); deactivating an account revokes its sessions and tokens
- **Completion sound** when ticking off tickets and subtasks (can be turned off)

**Collect requests**

- **Submission forms:** shareable links that create tickets, public or with sign-in, with configurable fields (hidden, optional, required), allowed tags, file uploads, a project choice and spam protection
- **Embed code** to place a form on your own website

**Connect**

- **REST API** with personal API tokens
- **AI assistants (MCP):** read-only access to projects and tickets for tools such as Claude Code
- **Microsoft Teams:** personal app, channel tabs with a project's board, and automatic sign-in (Teams SSO)
- **Teams channel notifications** for new, completed and assigned tickets

**Everyday use**

- English and German interface, following the system language by default
- Light, dark and system theme
- Works on phones and tablets: responsive navigation, full-screen ticket editing and touch controls

## Screenshots

The screenshots show the English interface with sample project data.

### Project overview

Track ticket counts and progress across projects.

![Project overview showing three projects and their progress](docs/screenshots/projects.png)

### Kanban board

Organize tickets by status, with priorities, assignees, tags, and subtasks visible on each card.

![Kanban board with tickets organized into To do, In progress, Review, and Done columns](docs/screenshots/kanban.png)

### Gantt timeline

Plan ticket schedules and see dependencies and scheduling conflicts.

![Gantt timeline showing scheduled tickets, dependency arrows, and a scheduling conflict](docs/screenshots/gantt.png)

## Installation

Kenny is published as a Docker image at `ghcr.io/sniphs98/kenny`. You need Docker with the Compose plugin; a checkout of this repository is not required.

**1. Create a folder with a `compose.yaml`:**

```yaml
services:
  kenny:
    image: ghcr.io/sniphs98/kenny:${KENNY_VERSION:-latest}
    restart: unless-stopped
    ports:
      - '127.0.0.1:3000:3000' # only reachable from this host; put a reverse proxy in front
    environment:
      ORIGIN: ${KENNY_ORIGIN:?Set KENNY_ORIGIN in .env}
      BETTER_AUTH_URL: ${KENNY_ORIGIN}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?Set BETTER_AUTH_SECRET in .env}
      ATTACHMENT_MAX_MB: ${ATTACHMENT_MAX_MB:-25}
      BODY_SIZE_LIMIT: ${BODY_SIZE_LIMIT:-30M}
      # Optional: Microsoft sign-in and Teams, see Configuration below
      MICROSOFT_CLIENT_ID: ${MICROSOFT_CLIENT_ID:-}
      MICROSOFT_CLIENT_SECRET: ${MICROSOFT_CLIENT_SECRET:-}
      MICROSOFT_TENANT_ID: ${MICROSOFT_TENANT_ID:-common}
      TEAMS_ENABLED: ${TEAMS_ENABLED:-false}
    volumes:
      - kenny-data:/app/data # database and attachments
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

volumes:
  kenny-data:
```

**2. Create a `.env` file next to it** with a random secret and the address people will use:

```bash
printf 'BETTER_AUTH_SECRET=%s\nKENNY_ORIGIN=https://kenny.example.com\nKENNY_VERSION=0.6.0\n' "$(openssl rand -base64 32)" > .env
```

For a quick local test, use `KENNY_ORIGIN=http://localhost:3000`. Pin `KENNY_VERSION` to a release from the [releases page](https://github.com/Sniphs98/kenny/releases) so updates happen only when you choose.

**3. Start Kenny:**

```bash
docker compose up -d
docker compose ps   # wait until the container is "healthy"
```

**4. Open Kenny and register.** The first account becomes the instance administrator. Migrations run automatically at startup.

### Reverse proxy and HTTPS

The port is bound to `127.0.0.1`, so serve Kenny through a reverse proxy with HTTPS at the address in `KENNY_ORIGIN`. Live updates use Server-Sent Events on `/api/v1/events`: the proxy must keep these connections open and must not buffer them. With [Caddy](https://caddyserver.com), which handles both and fetches certificates automatically:

```
kenny.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

With nginx, set `proxy_buffering off;` and a long `proxy_read_timeout` (e.g. `1h`) for `/api/v1/events`, and raise `client_max_body_size` to at least the attachment limit.

### Updates and backups

- **Update:** set `KENNY_VERSION` to the new release, then run `docker compose pull && docker compose up -d`. Migrations run at startup and are not reversed when you go back to an older image, so back up first.
- **Backup:** the `kenny-data` volume contains the database and the attachments; back them up together. For example, stop Kenny and archive the volume (Compose prefixes the volume with the folder name, here `kenny`):

```bash
docker compose stop
docker run --rm -v kenny_kenny-data:/data -v "$PWD":/backup alpine tar czf /backup/kenny-backup.tgz -C /data .
docker compose start
```

## Configuration

| Variable                                                    | Default                        | Description                                                                                                          |
| ----------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                        | – (required)                   | Long random secret for sessions, e.g. `openssl rand -base64 32`. Changing it signs everyone out.                     |
| `KENNY_ORIGIN`                                              | – (required in `compose.yaml`) | Public URL of Kenny. Compose passes it on as `ORIGIN` and `BETTER_AUTH_URL`; set those two directly without Compose. |
| `KENNY_VERSION`                                             | `latest`                       | Image version used by `compose.yaml`.                                                                                |
| `ATTACHMENT_MAX_MB`                                         | `25`                           | Maximum size of one attachment in MB.                                                                                |
| `BODY_SIZE_LIMIT`                                           | `30M`                          | Maximum request size; must exceed `ATTACHMENT_MAX_MB`.                                                               |
| `DATABASE_URL`                                              | `/app/data/kenny.db`           | SQLite database file.                                                                                                |
| `ATTACHMENTS_DIR`                                           | `/app/data/attachments`        | Storage directory for attachments.                                                                                   |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`            | –                              | Enable **Sign in with Microsoft** (Entra ID); redirect URI `<KENNY_ORIGIN>/api/auth/callback/microsoft`.             |
| `MICROSOFT_TENANT_ID`                                       | `common`                       | Entra tenant; use your tenant ID for a company installation.                                                         |
| `MICROSOFT_AUTHORITY`                                       | Microsoft default              | Only for national clouds, e.g. `https://login.microsoftonline.us`.                                                   |
| `TEAMS_ENABLED`                                             | `false`                        | Run Kenny as a Microsoft Teams app; see [Microsoft Teams](docs/microsoft-teams.md).                                  |
| `TEAMS_APP_VERSION`, `TEAMS_APP_ID`, `TEAMS_DEVELOPER_NAME` | `1.0.0`, derived, `Kenny`      | Details of the Teams app package.                                                                                    |

Variables that are not listed in `compose.yaml` (such as `MICROSOFT_AUTHORITY` or `TEAMS_APP_ID`) need an extra line under `environment`.

## Tech stack

SvelteKit 2 (Svelte 5), TypeScript, SQLite through `better-sqlite3`, Drizzle ORM, Better Auth, and `adapter-node`.

## Development

Use the Node.js version pinned in `.nvmrc`, then run:

```bash
npm ci
cp .env.example .env   # Set BETTER_AUTH_SECRET: openssl rand -base64 32
npm run dev
```

Open <http://localhost:5173> and register an account. The database is stored at `data/kenny.db`; migrations run automatically at startup.

### Development scenarios

Instead of creating data manually, use `dev:scenario` to start the app with sample data. Each scenario has its own database under `data/scenarios/<name>/`; it leaves `data/kenny.db` untouched and does not require a `.env` file.

```bash
npm run dev:scenario -- list           # List available scenarios
npm run dev:scenario -- demo           # Seed on first start; reuse existing data afterward
npm run dev:scenario -- demo --reset   # Recreate the scenario from scratch
npm run dev:scenario -- demo --port 5180
```

| Scenario | Contents                                                                                      |
| -------- | --------------------------------------------------------------------------------------------- |
| `leer`   | One user, no projects (the scenario identifier means "empty" in German)                       |
| `demo`   | Two projects, three users, and ~30 tickets with tags, subtasks, dependencies, and attachments |
| `gantt`  | A schedule with dependency chains, a scheduling conflict, and unscheduled tickets             |

Sign in with the scenario's first user, e.g. `anna@example.com` with the password `kenny-demo`. Dates are relative to the current day so the Gantt chart and overdue tickets remain useful.

Scenarios are small files under `scenarios/`. On first start, `scripts/scenario-seed.mjs` seeds them through the running app's REST API. This applies the same rules as the UI and keeps scenarios independent of the database implementation. To add a scenario, create another file in `scenarios/`; invalid references, columns, tags, or date ranges are reported before seeding. The command refuses to run with `NODE_ENV=production`.

### Building the container

For installing Kenny, see [Installation](#installation). The repository's `compose.yml` can also build the image from source: `cp .env.example .env`, set the values, then `docker compose up -d --build`. Container builds use the official Node.js 22 image through its Amazon ECR Public mirror to avoid anonymous Docker Hub pull limits; the Node.js version is pinned in `Dockerfile` and `.nvmrc`. The image runs as the `node` user and keeps the database and attachments under `/app/data`.

Releases are published at `ghcr.io/sniphs98/kenny:<version>` with release notes on GitHub. Every merge to `main` that contains a `feat`, `fix` or `perf` change runs all CI checks and then publishes the next version automatically. Manually triggering the release workflow does not publish an image. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

To run without Docker:

```bash
npm run build
DATABASE_URL=/path/to/kenny.db BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://kenny.example.com \
  ORIGIN=https://kenny.example.com PORT=3000 BODY_SIZE_LIMIT=30M node build
```

The `drizzle/` directory must be next to the build or specified through `MIGRATIONS_DIR`. `/api/health` checks whether the server can access the migrated database.

### Languages and translations

The UI is available in English and German. Without an explicit choice, it follows the system language (the browser or `Accept-Language`); unsupported languages fall back to English. Users can choose a language under **Language** in the user menu or select **System language** to follow the system setting again. The choice is stored in the `PARAGLIDE_LOCALE` cookie (see `src/lib/locale-choice.ts`) and applies to server rendering, calendars, dates, and numbers. User-created project names, board columns, tags, and ticket content are not translated. URLs and API field names stay the same.

Translations live in `messages/de.json` and `messages/en.json`; inlang configuration lives in `project.inlang/settings.json`. Add new UI messages to both catalogs and use them as `m.message_name()` from `$lib/paraglide/messages.js`. `npm ci`, `npm run dev`, `npm run build`, and `npm run check` generate typed messages; run `npm run i18n:compile` to generate them manually. Generated files under `src/lib/paraglide/` are not committed. The message plugin is installed as an npm dependency, so builds do not need to download it from a CDN.

Changing the language reloads the current page. Errors from framework-independent contracts and services remain stable internally and are localized at the UI/API boundary. When adding a business error, also add its mapping in `src/lib/i18n.ts`.

### Changing the database schema

Update the schema in `src/lib/server/db/schema.ts`, then run `npm run db:generate`. The new migration is applied on the next startup.

### Quality checks and tests

```bash
npm run verify                   # Guard, formatting, lint, types, unit/integration tests, build
npx playwright install chromium  # One-time browser installation
npm run test:e2e:production       # Build and browser/HTTP tests
npm run test:coverage             # Contract and service coverage
npm run docker:build
npm run docker:test               # Container, API, uploads, and persistence after restart
```

Unit tests live under `tests/unit`, service and migration tests under `tests/integration`, and browser and HTTP tests under `tests/e2e`. Service tests use in-memory SQLite. Playwright starts its own built Node server on port 4174 with a fresh database under `data/test`, leaving development data untouched. Each test creates its own project.

GitHub Actions checks pull requests and `main` automatically. Shared Zod contracts live in `src/lib/contracts`; forms use Superforms. [CONTRIBUTING.md](CONTRIBUTING.md) describes the issue/PR workflow, and [AGENTS.md](AGENTS.md) contains the rules for AI-assisted changes. The English and German UI uses ParaglideJS.

## Submission forms

Under **Forms** (`/settings/forms`) you can create links that let other people submit tickets, for example customers or colleagues without a Kenny account.

- **One project or a choice:** A form with one project is a fixed link for that project. With several projects, the submitter picks the project.
- **Sign-in:** Each form is either public or requires sign-in. Signed-in submissions are created as the signed-in user.
- **E-mail (public forms):** hidden, optional or required. The address is stored on the ticket and shown as “Submitted via …” in the ticket sidebar.
- **Fields:** The title is always required. Description, priority, start, due date, tags and attachments can each be hidden, optional or required. Values for hidden fields are ignored.
- **Tags:** Submitters can only pick existing tags of the chosen project. Optionally, a form allows only selected tags; deleted tags disappear from the selection automatically.
- **Attachments:** Up to 5 files per submission, chosen, dragged in or pasted with Ctrl+V (screenshots). Submitters see a preview and can remove files before submitting. The usual size limit (`ATTACHMENT_MAX_MB`, default 25 MB) applies.
- **Links:** `/submit/<token>` with a random token. Generating a new link or deactivating the form makes the old link stop working. Deleting a form keeps its tickets.
- **Embedding:** **Embed** shows an HTML snippet (iframe plus a small script that adjusts the height) for your own website. The embedded view (`/submit/<token>?embed`) has no page background and a compact header. Forms that require sign-in cannot be embedded, because sign-in does not work inside a third-party frame. Only `/submit/…` pages may be framed by other sites; every other page sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
- Submitted tickets land in the first open column of the project.
- **Spam protection:** a hidden honeypot field (bot submissions are silently dropped) and a limit of 10 anonymous submissions per IP address and 10 minutes. The limit is kept in memory of the Node process.

## REST API

Base URL: `/api/v1`. JSON write endpoints validate input with Zod and reject unknown fields with HTTP 400. For `PATCH`, omitted fields remain unchanged; `null` clears values that support it. Authenticate with `Authorization: Bearer <token>`; create tokens under **API** in the app. In the browser, the API also accepts the current sign-in session.

Tickets can be addressed by ID (`42`) or key (`WEB-12`); projects by ID or key.

| Method           | Path                                          | Description                                                                       |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| GET              | `/events?project=:project`                    | Live updates via Server-Sent Events; omit `project` to watch accessible projects  |
| GET              | `/me`                                         | Current user                                                                      |
| GET              | `/users`                                      | All users                                                                         |
| GET              | `/projects`                                   | Projects with ticket counts                                                       |
| POST             | `/projects`                                   | Create a project: `{name, key?, description?, color?}`                            |
| GET/PATCH/DELETE | `/projects/:project`                          | Read (including columns), update, or delete a project                             |
| GET/POST         | `/projects/:project/columns`                  | List or create columns: `{name, isDone?, isBacklog?}`                             |
| PATCH/DELETE     | `/projects/:project/columns/:id`              | Update `{name?, isDone?, isBacklog?, position?}` or delete a column               |
| GET/POST         | `/projects/:project/tags`                     | List or create tags: `{name, color?}`                                             |
| PATCH/DELETE     | `/projects/:project/tags/:id`                 | Update `{name?, color?}` or delete a tag                                          |
| GET              | `/projects/:project/tickets?closed=false`     | List tickets                                                                      |
| POST             | `/projects/:project/tickets`                  | Create a ticket                                                                   |
| GET              | `/tickets/:ticket`                            | Ticket with subtasks, parent ticket, and links                                    |
| PATCH            | `/tickets/:ticket`                            | Update a ticket                                                                   |
| DELETE           | `/tickets/:ticket`                            | Delete a ticket (including subtasks)                                              |
| POST             | `/tickets/:ticket/close`                      | Complete a ticket (move it to the first column marked as done)                    |
| POST             | `/tickets/:ticket/reopen`                     | Reopen a ticket                                                                   |
| POST             | `/tickets/:ticket/subtasks`                   | Create a subtask (same body as creating a ticket)                                 |
| POST             | `/tickets/:ticket/links`                      | Link tickets: `{target: "WEB-3", type: "depends_on" \| "blocks" \| "relates"}`    |
| DELETE           | `/tickets/:ticket/links/:id`                  | Remove a link                                                                     |
| GET              | `/tickets/:ticket/attachments`                | List attachments                                                                  |
| POST             | `/tickets/:ticket/attachments?filename=x.png` | Upload an attachment as the request body (or `multipart/form-data`, field `file`) |
| GET              | `/attachments/:id`                            | Download an attachment (`?download` forces download)                              |
| DELETE           | `/attachments/:id`                            | Delete an attachment                                                              |

Fields for creating or updating a ticket (all optional except `title` when creating):

```json
{
	"title": "Improve the login page",
	"description": "Optional description",
	"priority": "low | medium | high | urgent",
	"column": "In Arbeit",
	"assignee": "name@example.com",
	"startDate": "2026-10-10",
	"dueDate": "2026-10-17",
	"parent": "WEB-3",
	"dependsOn": ["WEB-1"],
	"relatesTo": ["WEB-7"],
	"tags": ["Bug", "Frontend"]
}
```

Use an actual column name for `column` (the example uses the default `In Arbeit` column, meaning "In progress"), or supply `columnId` instead. `position` sets the order within a column. Errors are returned as `{"error": "..."}` with the appropriate HTTP status.

```bash
curl -X POST http://localhost:5173/api/v1/projects/WEB/tickets \
  -H "Authorization: Bearer $KENNY_TOKEN" -H "Content-Type: application/json" \
  -d '{"title": "Login bug", "priority": "high"}'

curl -X POST http://localhost:5173/api/v1/tickets/WEB-12/close \
  -H "Authorization: Bearer $KENNY_TOKEN"

curl -X POST "http://localhost:5173/api/v1/tickets/WEB-12/attachments?filename=screenshot.png" \
  -H "Authorization: Bearer $KENNY_TOKEN" -H "Content-Type: image/png" --data-binary @screenshot.png
```

## AI assistants (MCP)

Kenny includes a [Model Context Protocol](https://modelcontextprotocol.io) server so AI assistants can read projects and tickets. It is served by the app itself at `/api/v1/mcp` (Streamable HTTP, stateless, JSON responses) and authenticates like the REST API with `Authorization: Bearer <token>`. The assistant sees exactly what the token's owner can see: projects they are a member of (all projects for instance administrators), and ticket links into other projects are hidden. Deactivating the account or revoking the token cuts off access.

All tools are read-only:

| Tool             | Description                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `list_projects`  | Accessible projects with key and ticket counts                                                                            |
| `search_tickets` | Tickets across accessible projects; filters `project`, `query`, `assignee` (`me`, `none`, id or email), `closed`, `limit` |
| `get_ticket`     | One ticket by key or ID with description, tags, assignee, parent, subtasks, links, and attachment metadata                |

The **API** page in the app shows the endpoint URL and configuration examples. For example, with Claude Code:

```bash
claude mcp add --transport http kenny https://kenny.example.com/api/v1/mcp \
  --header "Authorization: Bearer $KENNY_TOKEN"
```

## Microsoft integration

Microsoft (Entra ID) sign-in is supported: setting `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` (optionally `MICROSOFT_TENANT_ID`) enables **Sign in with Microsoft** on the login page. Configure `<BETTER_AUTH_URL>/api/auth/callback/microsoft` as the redirect URI in the app registration.

**Microsoft Teams:** With `TEAMS_ENABLED=true`, Kenny runs as a Teams app with a personal tab, channel tabs that show a project's board, and automatic sign-in through Teams SSO. Administrators find the setup values and the app package under **user menu → Microsoft Teams**; see [Microsoft Teams](docs/microsoft-teams.md) for the Entra ID setup, internal servers with a company CA, security notes and troubleshooting.

**Teams channel notifications:** Project administrators can post new, completed and assigned tickets to a Teams channel through a Teams workflow (**project settings → Teams notifications**); see [Channel notifications](docs/microsoft-teams.md#channel-notifications).

Ideas for future integrations include creating tickets from Teams messages and synchronizing due dates with the Outlook calendar.

## Project structure

```
src/lib/server/db/          Drizzle schema (auth and application tables) and database connection
src/lib/server/services/    Project and ticket business logic shared by the UI and API
src/lib/server/auth.ts      Better Auth configuration
src/lib/server/api*.ts      API token validation and handler wrapper
src/lib/server/mcp.ts       MCP tools for AI assistants
src/routes/api/v1/          REST API and MCP endpoint
src/routes/projects/[key]/  Board, Gantt, and settings
src/routes/tickets/[key]/   Ticket details
```

## User management and project access

Instance administrators can manage accounts through **Users** in the user menu. Project administrators can assign **Reader**, **Member**, or **Project administrator** roles in the **Members** tab. Permissions apply to the UI, REST API, and attachment downloads. Deactivating an account revokes its sessions and API tokens while preserving tickets and assignments.

See [User management and project access](docs/user-management.md) for administrator bootstrap, upgrade behavior, roles, API endpoints, and Microsoft Entra ID integration.

Form management under **Forms** is restricted to instance administrators. Public submission links keep their configured sign-in and email requirements.

### Live updates

Project lists, boards, Gantt charts and ticket details refresh when another user changes data. Unsaved title and description edits are preserved. The connection status shows when the app is reconnecting; manual refresh remains available.

`GET /api/v1/events` streams `change` events with `{projectId, ticket?, kind, origin?}`. Filter with `?project=KEY`. Events are restricted to accessible projects and active accounts. The stream sends a heartbeat every 25 seconds; proxies should keep connections open and disable buffering. The broadcaster operates within one Node process. Multiple instances need a shared event channel.
