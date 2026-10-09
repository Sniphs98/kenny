# Kenny

Projekt- und Ticketverwaltung mit Kanban-Board und Gantt-Chart.

- **Projekte** mit eigenem Kürzel (z.B. `WEB`), Tickets heißen dann `WEB-1`, `WEB-2`, …
- **Kanban-Board** mit frei konfigurierbaren Spalten und Drag & Drop
- **Gantt-Chart** mit Start-/Fälligkeitsdatum, Balken per Maus verschieben und in der Länge ändern, Pfeile für Abhängigkeiten (rot, wenn ein Ticket vor seiner Voraussetzung beginnt)
- **Tickets** mit Priorität, Zuständigem, Beschreibung, **Unteraufgaben** und **Verknüpfungen** (`setzt voraus`, `ist Voraussetzung für`, `verknüpft mit`), Zyklen werden verhindert
- **REST-API** zum Anlegen, Ändern und Abschließen von Tickets mit persönlichen API-Tokens
- **Benutzerverwaltung** mit [Better Auth](https://better-auth.com) (E-Mail/Passwort, Microsoft-Login vorbereitet)

## Technik

SvelteKit 2 (Svelte 5), TypeScript, SQLite über `better-sqlite3`, Drizzle ORM, Better Auth, `adapter-node`.

## Loslegen

```bash
npm ci
cp .env.example .env   # BETTER_AUTH_SECRET setzen: openssl rand -base64 32
npm run dev
```

Dann <http://localhost:5173> öffnen und ein Konto registrieren. Die Datenbank liegt unter `data/kenny.db`, Migrationen werden beim Start automatisch ausgeführt.

### Testszenarien

Statt Daten von Hand anzulegen, startet `dev:scenario` die App mit einem vorbefüllten Stand. Jedes Szenario hat eine eigene Datenbank unter `data/scenarios/<name>/`; `data/kenny.db` bleibt unberührt, und eine `.env` ist dafür nicht nötig.

```bash
npm run dev:scenario -- list           # verfügbare Szenarien
npm run dev:scenario -- demo           # beim ersten Start befüllen, danach mit den vorhandenen Daten starten
npm run dev:scenario -- demo --reset   # Szenario frisch neu erzeugen
npm run dev:scenario -- demo --port 5180
```

| Szenario | Inhalt                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- |
| `leer`   | Nur ein Benutzer, keine Projekte                                                            |
| `demo`   | Zwei Projekte, drei Benutzer, ~30 Tickets mit Tags, Unteraufgaben, Abhängigkeiten, Anhängen |
| `gantt`  | Zeitplan mit Abhängigkeitsketten, einem Terminkonflikt und Tickets ohne Termin              |

Angemeldet wird mit dem ersten Benutzer des Szenarios, z. B. `anna@example.com` mit dem Passwort `kenny-demo`. Datumsangaben sind relativ zum heutigen Tag, damit Gantt und überfällige Tickets immer passen.

Szenarien liegen als kleine Dateien unter `scenarios/` und werden beim ersten Start über die REST-API der laufenden App befüllt (`scripts/scenario-seed.mjs`). Dadurch gelten dieselben Regeln wie in der Oberfläche, und die Szenarien hängen nicht von der Datenbank ab. Ein neues Szenario ist eine weitere Datei in `scenarios/`; ungültige Verweise, Spalten, Tags oder Datumsbereiche werden vor dem Befüllen gemeldet. Bei `NODE_ENV=production` bricht der Befehl ab.

### Docker und Produktion

Kenny wird als Docker-Container ausgeliefert. Das Image enthält den Node-Produktionsserver und die Migrationen. Es läuft als Benutzer `node`; Datenbank und Anhänge liegen gemeinsam im persistenten Volume unter `/app/data`.

```bash
cp .env.example .env
# BETTER_AUTH_SECRET durch einen eigenen Wert ersetzen: openssl rand -base64 32
# KENNY_ORIGIN auf die öffentlich erreichbare URL setzen
# KENNY_VERSION auf eine veröffentlichte Version setzen

docker compose pull
docker compose up -d
```

Für einen lokalen Build ohne veröffentlichtes Image: `docker compose up -d --build`. Die Anwendung ist dann unter <http://localhost:3000> erreichbar. Der Port wird standardmäßig nur an `127.0.0.1` gebunden; für Zugriff von außen einen Reverse Proxy verwenden. `KENNY_ORIGIN` setzt sowohl `ORIGIN` als auch die Auth-URL.

Releases erscheinen unter `ghcr.io/sniphs98/kenny:<version>`. Ein Tag wie `v0.1.0` auf einem Commit in `main` startet alle CI-Prüfungen und veröffentlicht erst nach deren Erfolg den Container. Ein manuell gestarteter Release-Workflow veröffentlicht nichts. Details stehen in [CONTRIBUTING.md](CONTRIBUTING.md).

`BODY_SIZE_LIMIT` muss über der maximalen Anhanggröße liegen (Standard 25 MB, `ATTACHMENT_MAX_MB`); im Container sind 30 MB voreingestellt. Datenbank und Anhänge gemeinsam sichern. Für ein Update eine konkrete Container-Version wählen, dann erneut `docker compose pull && docker compose up -d` ausführen. Migrationen laufen beim Start automatisch; sie werden bei einem Image-Rollback nicht rückgängig gemacht.

Für Betrieb ohne Docker:

```bash
npm run build
DATABASE_URL=/pfad/kenny.db BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://kenny.example.com \
  ORIGIN=https://kenny.example.com PORT=3000 BODY_SIZE_LIMIT=30M node build
```

Der Ordner `drizzle/` muss neben dem Build liegen oder per `MIGRATIONS_DIR` angegeben werden. `/api/health` prüft, ob der Server auf die migrierte Datenbank zugreifen kann.

### Sprache und Übersetzungen

Die Oberfläche gibt es auf Deutsch und Englisch. Ohne eigene Wahl folgt sie der Systemsprache (Browser bzw. `Accept-Language`); wird diese nicht unterstützt, gilt Englisch. Jeder Benutzer kann die Sprache im Benutzermenü unter **Sprache** festlegen oder mit **Systemsprache** wieder der Systemeinstellung folgen. Die Wahl wird im Cookie `PARAGLIDE_LOCALE` gespeichert (siehe `src/lib/locale-choice.ts`) und gilt auch für Server-Rendering, Kalender, Datums- und Zahlenanzeigen. Eigene Projektnamen, Board-Spalten, Tags und Ticketinhalte werden nicht übersetzt. URLs und API-Feldnamen bleiben gleich.

Die Übersetzungen stehen in `messages/de.json` und `messages/en.json`, die inlang-Konfiguration in `project.inlang/settings.json`. Neue UI-Texte in beiden Katalogen ergänzen und als `m.nachricht()` aus `$lib/paraglide/messages.js` verwenden. `npm ci`, `npm run dev`, `npm run build` und `npm run check` erzeugen die typisierten Nachrichten; manuell geht das mit `npm run i18n:compile`. Generierte Dateien unter `src/lib/paraglide/` werden nicht committed. Der Nachrichten-Plugin ist als npm-Abhängigkeit installiert; der Build benötigt keinen Download von einer CDN-URL.

Die Sprachwahl lädt die aktuelle Seite neu. Fehler aus den frameworkfreien Verträgen und Services bleiben intern stabil und werden an der UI-/API-Grenze lokalisiert. Bei neuen fachlichen Fehlern auch die Zuordnung in `src/lib/i18n.ts` ergänzen.

### Datenbankschema ändern

Schema in `src/lib/server/db/schema.ts` anpassen, dann `npm run db:generate`. Die neue Migration wird beim nächsten Start angewendet.

### Qualität und Tests

```bash
npm run verify                   # Guard, Format, Lint, Typen, Unit-/Integrationstests, Build
npx playwright install chromium  # einmalig
npm run test:e2e:production       # Build und Browser-/HTTP-Tests
npm run test:coverage             # Coverage für Verträge und Services
npm run docker:build
npm run docker:test               # Container, API, Upload und Persistenz nach Neustart
```

Unit-Tests liegen unter `tests/unit`, Service- und Migrationstests unter `tests/integration`, Browser- und HTTP-Tests unter `tests/e2e`. Die Service-Tests verwenden SQLite im Speicher. Playwright startet einen eigenen gebauten Node-Server auf Port 4174 mit einer frischen Datenbank unter `data/test`; Entwicklungsdaten bleiben unberührt. Jeder Test legt sein eigenes Projekt an.

GitHub Actions prüft Pull Requests und `main` automatisch. Gemeinsame Zod-Verträge stehen in `src/lib/contracts`; Formulare verwenden Superforms. [CONTRIBUTING.md](CONTRIBUTING.md) beschreibt den Issue-/PR-Ablauf, [AGENTS.md](AGENTS.md) die Regeln für KI-Änderungen. Die Oberfläche ist mit ParaglideJS auf Deutsch und Englisch verfügbar.

## REST-API

Basis-URL: `/api/v1`. Schreibende JSON-Endpunkte validieren Eingaben mit Zod; unbekannte Felder werden mit HTTP 400 abgelehnt. Bei `PATCH` bleiben ausgelassene Felder unverändert, `null` leert ausdrücklich löschbare Werte. Authentifizierung über `Authorization: Bearer <token>`; Tokens werden in der App unter **API** erstellt. Im Browser funktioniert die API auch mit der normalen Anmeldung.

Tickets können per ID (`42`) oder Schlüssel (`WEB-12`) angesprochen werden, Projekte per ID oder Kürzel.

| Methode          | Pfad                                          | Beschreibung                                                                  |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| GET              | `/me`                                         | Eigener Benutzer                                                              |
| GET              | `/users`                                      | Alle Benutzer                                                                 |
| GET              | `/projects`                                   | Projekte mit Ticketzählern                                                    |
| POST             | `/projects`                                   | Projekt anlegen: `{name, key?, description?, color?}`                         |
| GET/PATCH/DELETE | `/projects/:projekt`                          | Projekt lesen (inkl. Spalten), ändern, löschen                                |
| GET/POST         | `/projects/:projekt/columns`                  | Spalten lesen / anlegen `{name, isDone?, isBacklog?}`                         |
| PATCH/DELETE     | `/projects/:projekt/columns/:id`              | Spalte ändern `{name?, isDone?, isBacklog?, position?}` / löschen             |
| GET/POST         | `/projects/:projekt/tags`                     | Tags lesen / anlegen `{name, color?}`                                         |
| PATCH/DELETE     | `/projects/:projekt/tags/:id`                 | Tag ändern `{name?, color?}` / löschen                                        |
| GET              | `/projects/:projekt/tickets?closed=false`     | Tickets auflisten                                                             |
| POST             | `/projects/:projekt/tickets`                  | Ticket anlegen                                                                |
| GET              | `/tickets/:ticket`                            | Ticket mit Unteraufgaben, Elternticket und Verknüpfungen                      |
| PATCH            | `/tickets/:ticket`                            | Ticket ändern                                                                 |
| DELETE           | `/tickets/:ticket`                            | Ticket löschen (inkl. Unteraufgaben)                                          |
| POST             | `/tickets/:ticket/close`                      | Abschließen (verschiebt in die erste „Erledigt“-Spalte)                       |
| POST             | `/tickets/:ticket/reopen`                     | Wieder öffnen                                                                 |
| POST             | `/tickets/:ticket/subtasks`                   | Unteraufgabe anlegen (Body wie Ticket anlegen)                                |
| POST             | `/tickets/:ticket/links`                      | Verknüpfen: `{target: "WEB-3", type: "depends_on" \| "blocks" \| "relates"}`  |
| DELETE           | `/tickets/:ticket/links/:id`                  | Verknüpfung entfernen                                                         |
| GET              | `/tickets/:ticket/attachments`                | Anhänge auflisten                                                             |
| POST             | `/tickets/:ticket/attachments?filename=x.png` | Anhang hochladen, Datei als Body (oder `multipart/form-data` mit Feld `file`) |
| GET              | `/attachments/:id`                            | Anhang herunterladen (`?download` erzwingt Download)                          |
| DELETE           | `/attachments/:id`                            | Anhang löschen                                                                |

Felder beim Anlegen/Ändern eines Tickets (alle außer `title` optional):

```json
{
	"title": "Login-Seite überarbeiten",
	"description": "Text",
	"priority": "low | medium | high | urgent",
	"column": "In Arbeit",
	"assignee": "name@firma.de",
	"startDate": "2026-10-10",
	"dueDate": "2026-10-17",
	"parent": "WEB-3",
	"dependsOn": ["WEB-1"],
	"relatesTo": ["WEB-7"],
	"tags": ["Bug", "Frontend"]
}
```

`column` akzeptiert den Spaltennamen oder `columnId`; mit `position` lässt sich die Reihenfolge in der Spalte setzen. Fehler kommen als `{"error": "..."}` mit passendem HTTP-Status zurück.

```bash
curl -X POST http://localhost:5173/api/v1/projects/WEB/tickets \
  -H "Authorization: Bearer $KENNY_TOKEN" -H "Content-Type: application/json" \
  -d '{"title": "Bug im Login", "priority": "high"}'

curl -X POST http://localhost:5173/api/v1/tickets/WEB-12/close \
  -H "Authorization: Bearer $KENNY_TOKEN"

curl -X POST "http://localhost:5173/api/v1/tickets/WEB-12/attachments?filename=screenshot.png" \
  -H "Authorization: Bearer $KENNY_TOKEN" -H "Content-Type: image/png" --data-binary @screenshot.png
```

## Microsoft-Anbindung

Die Anmeldung mit Microsoft (Entra ID) ist vorbereitet: Sobald `MICROSOFT_CLIENT_ID` und `MICROSOFT_CLIENT_SECRET` (optional `MICROSOFT_TENANT_ID`) gesetzt sind, erscheint auf der Login-Seite „Mit Microsoft anmelden“. Als Redirect-URI in der App-Registrierung `<BETTER_AUTH_URL>/api/auth/callback/microsoft` eintragen.

Weitere Ideen für später: Tickets aus Teams/Outlook anlegen (über die REST-API), Fälligkeiten in den Outlook-Kalender synchronisieren, Benachrichtigungen in Teams.

## Aufbau

```
src/lib/server/db/          Drizzle-Schema (Auth- und App-Tabellen) und DB-Verbindung
src/lib/server/services/    Geschäftslogik für Projekte und Tickets (von UI und API genutzt)
src/lib/server/auth.ts      Better-Auth-Konfiguration
src/lib/server/api*.ts      API-Token-Prüfung und Handler-Wrapper
src/routes/api/v1/          REST-API
src/routes/projects/[key]/  Board, Gantt, Einstellungen
src/routes/tickets/[key]/   Ticketdetails
```
