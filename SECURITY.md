# Sicherheitsprobleme

Keine Zugangsdaten oder privaten Nutzerdaten in Issues, PRs oder Logs veröffentlichen.

Sicherheitslücken möglichst über den privaten Meldeweg im GitHub-Security-Tab melden, sofern dieser aktiviert ist. Andernfalls zuerst einen privaten Kontakt zum Maintainer herstellen und technische Details privat übermitteln. Das Repository enthält keinen eingerichteten separaten Meldekanal.

Produktive Installationen müssen einen eigenen starken `BETTER_AUTH_SECRET` verwenden. Datenbank und Anhänge gemeinsam sichern. Abhängigkeiten über Dependabot aktuell halten und CI-Fehler vor einer Veröffentlichung beheben.
