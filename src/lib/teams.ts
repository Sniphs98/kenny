// Microsoft Teams im Browser: Verbindung zum Teams-Fenster, Anmeldung per SSO und Design übernehmen.
// Das SDK wird nur auf den Teams-Seiten geladen, damit es die übrige App nicht vergrößert.
import { setMode } from 'mode-watcher';
import { authClient } from '$lib/auth-client';

type TeamsSdk = typeof import('@microsoft/teams-js');

let connection: Promise<TeamsSdk | null> | null = null;

/** Mit Teams verbinden; null außerhalb von Teams (kein umgebendes Fenster oder keine Antwort) */
export function connectTeams(timeoutMs = 8000): Promise<TeamsSdk | null> {
	connection ??= (async () => {
		if (window.parent === window) return null;
		const sdk = await import('@microsoft/teams-js');
		const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
		try {
			await Promise.race([sdk.app.initialize(), timeout]);
		} catch {
			return null;
		}
		followTheme(sdk);
		return sdk;
	})();
	return connection;
}

/** Hell/Dunkel wie in Teams; Teams-Kontrastmodus wird als Dunkel dargestellt */
function followTheme(sdk: TeamsSdk) {
	const apply = (theme: string | undefined) => setMode(theme === 'default' || !theme ? 'light' : 'dark');
	sdk.app
		.getContext()
		.then((context) => apply(context.app.theme))
		.catch(() => {});
	sdk.app.registerOnThemeChangeHandler(apply);
}

/**
 * Teams-SSO: Token von Teams holen und damit bei Kenny anmelden.
 * Der Server prüft Signatur, Tenant und Zielgruppe und ordnet das Konto über die Entra-ID zu.
 */
export async function signInWithTeams(sdk: TeamsSdk) {
	const token = await sdk.authentication.getAuthToken();
	const result = await authClient.signIn.social({ provider: 'microsoft', idToken: { token } });
	if (result.error) throw new Error(result.error.message || result.error.statusText || 'SSO failed');
}
