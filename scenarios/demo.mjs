// @ts-check
// Allgemeines Demo: zwei Projekte, drei Benutzer, Tags, Unteraufgaben, Abhängigkeiten und Anhänge.
// Zahlen bei start/due sind Tage relativ zu heute.

/** 16×16 PNG für die Bildvorschau bei Anhängen */
const PNG =
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAB20lEQVR4nAXBMQqAIABA0e4aBDkUBDYoBDYUBDYUBDkoCE5OTk4d6t+g95q2o+8YO2SH7jAde4ftuDvejtCROnJH6agdX0fTCnrBKJACLTCCXWAFt+AVBEESZEERVMEnaNqBfmAckAN6wAzsA3bgHngHwkAayANloA58A0070U+ME3JCT5iJfcJO3BPvRJhIE3miTNSJb6JpZ/qZcUbO6Bkzs8/YmXvmnQkzaSbPlJk68800raJXjAqp0Aqj2BVWcSteRVAkRVYURVV8iqZd6BfGBbmgF8zCvmAX7oV3ISykhbxQFurCt9C0K/3KuCJX9IpZ2Vfsyr3yroSVtJJXykpd+VaadqPfGDfkht4wG/uG3bg33o2wkTbyRtmoG99G0x70B+OBPNAH5mA/sAf3wXsQDtJBPigH9eA7aNqT/mQ8kSf6xJzsJ/bkPnlPwkk6ySflpJ58J0170V+MF/JCX5iL/cJe3BfvRbhIF/miXNSL76JpH/qH8UE+6AfzsD/Yh/vhfQgP6SE/lIf68D00raN3jA7p0A7j2B3WcTteR3AkR3YUR3V8jqb19J7RIz3aYzy7x3puz+sJnuTJnuKpns/TtJE+MkZkREdMZI/YyB15IyGSIjlSIjXyRX6z2wUf0Nnd5AAAAABJRU5ErkJggg==';

/** @type {import('../scripts/scenario-seed.mjs').Scenario} */
export default {
	description: 'Zwei Projekte, drei Benutzer, ~30 Tickets mit Tags, Unteraufgaben, Abhängigkeiten und Anhängen',
	users: [
		{ name: 'Anna Admin', email: 'anna@example.com' },
		{ name: 'Ben Berger', email: 'ben@example.com' },
		{ name: 'Clara Conrad', email: 'clara@example.com' }
	],
	projects: [
		{
			name: 'Kenny App',
			key: 'APP',
			color: '#6366f1',
			description: 'Weiterentwicklung der Projektverwaltung.',
			tags: [
				{ name: 'UX', color: '#ec4899' },
				{ name: 'Tech-Debt', color: '#78716c' }
			],
			tickets: [
				{
					ref: 'login',
					title: 'Login mit Microsoft',
					description:
						'Anmeldung über Entra ID anbieten.\n\nAkzeptanz: Button auf der Login-Seite, Konto wird verknüpft.',
					priority: 'high',
					column: 'In Arbeit',
					assignee: 'anna@example.com',
					tags: ['Feature'],
					start: -4,
					due: 3,
					subtasks: [
						{ title: 'App-Registrierung in Azure', closed: true },
						{ title: 'Callback-Route', closed: true },
						{ title: 'Konto verknüpfen', assignee: 'anna@example.com' }
					],
					attachments: [
						{
							name: 'ablauf.md',
							text: '# Login-Ablauf\n\n1. Button klicken\n2. Microsoft-Login\n3. Zurück zu Kenny\n'
						},
						{ name: 'skizze.png', base64: PNG, type: 'image/png' }
					]
				},
				{
					ref: 'rechte',
					title: 'Rollen und Rechte',
					priority: 'medium',
					tags: ['Feature'],
					start: 4,
					due: 14,
					dependsOn: ['login']
				},
				{
					title: 'Board lädt bei 500 Tickets langsam',
					priority: 'urgent',
					column: 'Review',
					assignee: 'ben@example.com',
					tags: ['Bug'],
					due: -1
				},
				{
					title: 'Dark Mode: Kontrast der Badges',
					priority: 'low',
					tags: ['UX', 'Bug'],
					assignee: 'clara@example.com'
				},
				{
					ref: 'export',
					title: 'Tickets als CSV exportieren',
					tags: ['Story'],
					assignee: 'clara@example.com',
					start: 1,
					due: 6
				},
				{ title: 'Import aus CSV', tags: ['Story'], relatesTo: ['export'] },
				{ title: 'Alte API-Routen entfernen', tags: ['Tech-Debt'], priority: 'low' },
				{ title: 'Tastenkürzel für neues Ticket', tags: ['UX'], column: 'Review', assignee: 'clara@example.com' },
				{ title: 'Anhänge per Drag & Drop', tags: ['Feature'], closed: true },
				{ title: 'Gantt: Meilensteine anzeigen', tags: ['Feature'], start: 10, due: 18 },
				{ title: 'Benachrichtigungen per E-Mail', tags: ['Story'], priority: 'medium' },
				{ title: 'Fehlerseite übersetzen', tags: ['UX'], closed: true },
				{ title: 'Datenbank-Backup dokumentieren', tags: ['Tech-Debt'], assignee: 'ben@example.com', due: 9 },
				{
					ref: 'suche',
					title: 'Globale Suche',
					priority: 'high',
					tags: ['Feature'],
					start: 15,
					due: 25,
					dependsOn: ['rechte']
				}
			]
		},
		{
			name: 'Marketing',
			key: 'MKT',
			color: '#f97316',
			description: 'Kampagnen und Inhalte.',
			tickets: [
				{
					ref: 'kampagne',
					title: 'Frühjahrskampagne planen',
					priority: 'high',
					column: 'In Arbeit',
					assignee: 'clara@example.com',
					start: -10,
					due: 5,
					subtasks: [
						{ title: 'Zielgruppe definieren', closed: true },
						{ title: 'Budget freigeben', assignee: 'anna@example.com' },
						{ title: 'Agentur briefen' }
					]
				},
				{
					ref: 'landing',
					title: 'Landingpage',
					start: 6,
					due: 12,
					dependsOn: ['kampagne'],
					assignee: 'ben@example.com'
				},
				{ title: 'Social-Media-Posts', start: 13, due: 20, dependsOn: ['landing'] },
				{ title: 'Pressemitteilung', due: -3, priority: 'medium', assignee: 'clara@example.com' },
				{ title: 'Messestand buchen', closed: true },
				{ title: 'Newsletter Mai', column: 'Review' },
				{ title: 'Fotoshooting Team' }
			]
		}
	]
};
