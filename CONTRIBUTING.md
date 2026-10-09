# Beiträge zu Kenny

## Einrichtung

Node-Version aus `.nvmrc` verwenden, dann `npm ci`. Für die Entwicklung `.env.example` nach `.env` kopieren und einen eigenen `BETTER_AUTH_SECRET` setzen. Mit `npm run dev` starten. Architektur und Regeln stehen in `AGENTS.md`.

## Issue → Branch → Pull Request

1. Bug oder Feature über das passende Issue-Formular beschreiben. Akzeptanzkriterien und Auswirkungen auf vorhandene Daten festhalten.
2. Einen Branch wie `feat/ticket-filter` oder `fix/date-validation` anlegen.
3. Verhalten in den Services umsetzen, Zod-Verträge und typisierten Client aktualisieren, passende Tests ergänzen.
4. Prüfungen ausführen und einen PR gegen `main` öffnen. Issue mit `Closes #123` verknüpfen.
5. CI und Review abwarten; anschließend per Squash mergen.

PR-Titel folgen Conventional Commits, zum Beispiel `feat(tickets): add filtering` oder `fix(api): reject invalid dates`. Eine Action prüft den Titel.

## Prüfbefehle

| Befehl                                        | Zweck                                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `npm run verify`                              | Guard, Format, Lint, Typen, Unit-/Service-/Migrationstests und Build |
| `npm run format`                              | Formatierung anwenden                                                |
| `npm test`                                    | Schnelle Unit-Tests                                                  |
| `npm run test:integration`                    | Services mit echter SQLite und Migration-Upgrades                    |
| `npm run test:ci`                             | Alle Unit-/Integrationstests mit verbindlichen Coverage-Grenzen      |
| `npm run test:coverage`                       | Coverage-Bericht unter `coverage/`                                   |
| `npm run test:e2e:production`                 | Build und Playwright gegen den Node-Produktionsserver                |
| `npm run docker:build && npm run docker:test` | Container inklusive Login, API, Uploads und Persistenz nach Neustart |

Einmalig `npx playwright install chromium` ausführen. E2E-Tests löschen ausschließlich `data/test`, starten ihren eigenen Server auf Port 4174 und verwenden einen eigenen Testbenutzer. Vitest verwendet eine In-Memory-Datenbank. Docker-Tests erzeugen einen eigenen Container und ein eigenes Volume und entfernen beide anschließend.

Die Coverage-Grenzen schützen die Ausgangsbasis (60 % Zeilen, jeweils 50 % Statements/Branches/Funktionen); für gemeinsame Verträge gelten 100 % Zeilen/Statements/Funktionen und 80 % Branches. Diese Coverage umfasst Vitest, nicht die Browser- und Container-Tests.

Bugfixes brauchen einen Regressionstest. Neue fachliche Regeln brauchen positive und negative Testfälle; API-Änderungen entsprechende HTTP-Tests. Einen fehlgeschlagenen Test untersuchen, statt ihn zu entfernen oder die Prüfung abzuschwächen.

Generierte UI-Basiskomponenten unter `src/lib/components/ui/` sind vom Formatter und ESLint ausgenommen; die Typprüfung erfasst sie weiterhin. Ihre Änderungen benötigen besondere Aufmerksamkeit im Review.

## GitHub-Konfiguration

Die Dateien richten Workflows und Vorlagen ein. Unter `.github/rulesets/main.json` liegt außerdem ein importierbares Ruleset für ein Solo-Repository (ohne verpflichtendes Fremdreview). Es muss in GitHub importiert oder per API aktiviert werden; die Datei selbst aktiviert keinen Branch-Schutz. Nach dem Push müssen die Repository-Einstellungen zusätzlich aktiviert werden:

- Ruleset für `main`: Pull Requests, erfolgreiche Checks `Quality checks`, `Production E2E`, `Docker smoke test` und `Conventional PR title`, aktuelle Basis vor dem Merge, keine Force-Pushes oder Löschungen.
- Mindestens ein Review, sobald eine zweite Person reviewen kann; veraltete Reviews bei neuen Änderungen verwerfen. Für ein Solo-Repository kein unerfüllbares Fremdreview erzwingen.
- Squash-Merge mit PR-Titel als Commit-Titel verwenden.
- Dependabot-Warnungen und verfügbares Secret-Scanning/Push-Protection aktivieren.
- GHCR-Paket nach der ersten Veröffentlichung bei Bedarf öffentlich stellen. Ein öffentliches Repository macht ein neues Paket nicht automatisch öffentlich.

CI läuft ohne Produktionsgeheimnisse. `npm audit --audit-level=high` blockiert hohe und kritische Advisories. Niedrigere Befunde bleiben sichtbar und sollten über Dependency-PRs bearbeitet werden. Der lokale Hygiene-Guard ergänzt Secret-Scanning, ersetzt aber keinen vollständigen Secret-Scanner.

## Docker-Releases

Nach einem grünen Merge auf `main` einen Tag wie `v0.1.0` auf den gewünschten Commit setzen und pushen. Der Release-Workflow prüft den gesamten Code einschließlich Container erneut und veröffentlicht erst danach `ghcr.io/sniphs98/kenny:0.1.0` und einen Commit-Tag. Stabile Versionen erhalten zusätzlich `latest`, Vorabversionen nicht. Zunächst wird Linux amd64 unterstützt.

Ein manuell gestarteter Release-Workflow baut und prüft ohne Veröffentlichung. Für einen Rollback einen früheren Container-Tag oder Digest verwenden. Datenbank und Anhänge vorher sichern; ein Image-Rollback macht bereits angewandte Datenbankmigrationen nicht rückgängig.

Es gibt keinen automatischen Produktions-Deploy. Mehrsprachigkeit mit Paraglide wird später als eigenes Feature geplant.
