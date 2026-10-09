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
npm install
cp .env.example .env   # BETTER_AUTH_SECRET setzen: openssl rand -base64 32
npm run dev
```

Dann <http://localhost:5173> öffnen und ein Konto registrieren. Die Datenbank liegt unter `data/kenny.db`, Migrationen werden beim Start automatisch ausgeführt.

### Produktion

```bash
npm run build
DATABASE_URL=/pfad/kenny.db BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://kenny.example.com \
  ORIGIN=https://kenny.example.com PORT=3000 BODY_SIZE_LIMIT=30M node build
```

`BODY_SIZE_LIMIT` muss über der maximalen Anhanggröße liegen (Standard 25 MB, `ATTACHMENT_MAX_MB`), sonst lehnt der Server größere Uploads ab. Anhänge liegen unter `data/attachments` (`ATTACHMENTS_DIR`) und gehören mit ins Backup.

Der Ordner `drizzle/` (Migrationen) muss neben dem Build liegen bzw. per `MIGRATIONS_DIR` angegeben werden.

### Datenbankschema ändern

Schema in `src/lib/server/db/schema.ts` anpassen, dann `npm run db:generate`. Die neue Migration wird beim nächsten Start angewendet.

### Tests

End-to-End-Tests mit Playwright liegen unter `tests/e2e`:

```bash
npx playwright install chromium   # einmalig
npm run test:e2e                  # alle Tests
npm run test:e2e:ui               # interaktiv mit Playwright-UI
```

Die Tests starten einen eigenen Dev-Server auf Port 4174 mit einer frischen Datenbank unter `data/test`; die Entwicklungsdaten bleiben unberührt. Jeder Test legt sein eigenes Projekt an, daher laufen sie parallel.

## REST-API

Basis-URL: `/api/v1`. Authentifizierung über `Authorization: Bearer <token>`; Tokens werden in der App unter **API** erstellt. Im Browser funktioniert die API auch mit der normalen Anmeldung.

Tickets können per ID (`42`) oder Schlüssel (`WEB-12`) angesprochen werden, Projekte per ID oder Kürzel.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/me` | Eigener Benutzer |
| GET | `/users` | Alle Benutzer |
| GET | `/projects` | Projekte mit Ticketzählern |
| POST | `/projects` | Projekt anlegen: `{name, key?, description?, color?}` |
| GET/PATCH/DELETE | `/projects/:projekt` | Projekt lesen (inkl. Spalten), ändern, löschen |
| GET/POST | `/projects/:projekt/columns` | Spalten lesen / anlegen `{name, isDone?, isBacklog?}` |
| PATCH/DELETE | `/projects/:projekt/columns/:id` | Spalte ändern `{name?, isDone?, isBacklog?, position?}` / löschen |
| GET/POST | `/projects/:projekt/tags` | Tags lesen / anlegen `{name, color?}` |
| PATCH/DELETE | `/projects/:projekt/tags/:id` | Tag ändern `{name?, color?}` / löschen |
| GET | `/projects/:projekt/tickets?closed=false` | Tickets auflisten |
| POST | `/projects/:projekt/tickets` | Ticket anlegen |
| GET | `/tickets/:ticket` | Ticket mit Unteraufgaben, Elternticket und Verknüpfungen |
| PATCH | `/tickets/:ticket` | Ticket ändern |
| DELETE | `/tickets/:ticket` | Ticket löschen (inkl. Unteraufgaben) |
| POST | `/tickets/:ticket/close` | Abschließen (verschiebt in die erste „Erledigt“-Spalte) |
| POST | `/tickets/:ticket/reopen` | Wieder öffnen |
| POST | `/tickets/:ticket/subtasks` | Unteraufgabe anlegen (Body wie Ticket anlegen) |
| POST | `/tickets/:ticket/links` | Verknüpfen: `{target: "WEB-3", type: "depends_on" \| "blocks" \| "relates"}` |
| DELETE | `/tickets/:ticket/links/:id` | Verknüpfung entfernen |
| GET | `/tickets/:ticket/attachments` | Anhänge auflisten |
| POST | `/tickets/:ticket/attachments?filename=x.png` | Anhang hochladen, Datei als Body (oder `multipart/form-data` mit Feld `file`) |
| GET | `/attachments/:id` | Anhang herunterladen (`?download` erzwingt Download) |
| DELETE | `/attachments/:id` | Anhang löschen |

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
