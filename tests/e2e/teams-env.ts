/** Teams-E2E: zweite Kenny-Instanz im Teams-Modus und nachgebautes Entra ID (tests/fixtures/fake-entra.mjs) */
export const TEAMS_E2E = {
	port: 4175,
	url: 'http://localhost:4175',
	entraPort: 4176,
	authority: 'http://127.0.0.1:4176',
	tenant: '11111111-1111-4111-8111-111111111111',
	clientId: 'e2e-kenny-teams-client'
};
