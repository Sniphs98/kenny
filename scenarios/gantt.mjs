// @ts-check
// Zeitplan mit Abhängigkeitsketten, einem Konflikt und Tickets ohne Termin.
// Zahlen bei start/due sind Tage relativ zu heute.

/** @type {import('../scripts/scenario-seed.mjs').Scenario} */
export default {
	description: 'Zeitplan mit Abhängigkeitsketten, einem Terminkonflikt und Tickets ohne Termin',
	users: [
		{ name: 'Anna Admin', email: 'anna@example.com' },
		{ name: 'Ben Berger', email: 'ben@example.com' }
	],
	projects: [
		{
			name: 'Website-Relaunch',
			key: 'WEB',
			color: '#3b82f6',
			description: 'Neue Website mit Shop – Planung im Gantt-Diagramm.',
			tickets: [
				{ ref: 'konzept', title: 'Konzept und Sitemap', start: -14, due: -8, closed: true },
				{
					ref: 'design',
					title: 'Designsystem',
					start: -7,
					due: 2,
					column: 'In Arbeit',
					assignee: 'ben@example.com',
					dependsOn: ['konzept'],
					subtasks: [
						{ title: 'Farben und Typografie', start: -7, due: -4, closed: true },
						{ title: 'Komponentenbibliothek', start: -3, due: 2, assignee: 'ben@example.com' }
					]
				},
				{ ref: 'frontend', title: 'Frontend umsetzen', start: 3, due: 16, priority: 'high', dependsOn: ['design'] },
				{
					ref: 'shop',
					title: 'Shop-Anbindung',
					start: 8,
					due: 20,
					assignee: 'anna@example.com',
					dependsOn: ['frontend']
				},
				// Konflikt: beginnt, bevor die Voraussetzung fertig ist (Pfeil wird rot)
				{ ref: 'tests', title: 'Abnahmetests', start: 12, due: 18, dependsOn: ['shop'] },
				{ title: 'Go-live', start: 22, due: 22, priority: 'urgent', dependsOn: ['tests'] },
				{ title: 'SEO-Texte', start: 5, due: 12, relatesTo: ['frontend'] },
				// Überfällig
				{ title: 'Hosting-Vertrag kündigen', due: -2, priority: 'high', assignee: 'anna@example.com' },
				// Ohne Termin: im Gantt per Klick einplanen
				{ title: 'Newsletter-Anmeldung' },
				{ title: 'Cookie-Banner prüfen', tags: ['Bug'] }
			]
		}
	]
};
