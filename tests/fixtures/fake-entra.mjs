// Nachgebautes Microsoft Entra ID für die Teams-E2E-Tests: liefert Signaturschlüssel wie
// https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys und signiert Tokens auf Anfrage.
// Nur für Tests; Kenny spricht es über MICROSOFT_AUTHORITY an.
import { createHash, randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_ENTRA_PORT || 4176);
const kid = 'kenny-e2e-key';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };

/** @param {unknown} value */
const base64url = (value) =>
	Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** @param {Record<string, unknown>} claims */
function mint(claims) {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url({ alg: 'RS256', typ: 'JWT', kid });
	const payload = base64url({ iat: now, nbf: now, exp: now + 3600, ver: '2.0', ...claims });
	const signature = sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
	return `${header}.${payload}.${signature}`;
}

// OAuth authorization codes are single-use and bound to PKCE, nonce and callback URI.
const codes = new Map();
let oauthProfile = {};
let paused = false;
createServer((req, res) => {
	const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
	/** @param {number} status @param {unknown} body */
	const send = (status, body) => {
		res.writeHead(status, { 'content-type': 'application/json' });
		res.end(JSON.stringify(body));
	};
	if (req.method === 'POST' && url.pathname === '/oauth-profile') {
		let body = '';
		req.on('data', (chunk) => (body += chunk));
		req.on('end', () => {
			const input = JSON.parse(body || '{}');
			oauthProfile = input.claims ?? {};
			paused = input.paused === true;
			send(200, { ok: true });
		});
		return;
	}
	if (req.method === 'GET' && /^\/[^/]+\/oauth2\/v2\.0\/authorize$/.test(url.pathname)) {
		const redirect = url.searchParams.get('redirect_uri');
		const state = url.searchParams.get('state');
		if (!redirect || !state) return send(400, { error: 'invalid_request' });
		const callback = new URL(redirect);
		const code = randomUUID();
		const tenant = url.pathname.split('/')[1];
		codes.set(code, {
			nonce: url.searchParams.get('nonce'),
			challenge: url.searchParams.get('code_challenge'),
			redirect: callback.href,
			claims: {
				tid: tenant,
				iss: `http://127.0.0.1:${port}/${tenant}/v2.0`,
				aud: url.searchParams.get('client_id'),
				...oauthProfile
			}
		});
		callback.searchParams.set('code', code);
		callback.searchParams.set('state', state);
		if (paused) return send(200, { callback: callback.href });
		res.writeHead(302, { location: callback.href }).end();
		return;
	}
	if (req.method === 'POST' && /^\/[^/]+\/oauth2\/v2\.0\/token$/.test(url.pathname)) {
		let body = '';
		req.on('data', (chunk) => (body += chunk));
		req.on('end', () => {
			const form = new URLSearchParams(body);
			const entry = codes.get(form.get('code'));
			codes.delete(form.get('code'));
			if (
				!entry ||
				entry.redirect !== form.get('redirect_uri') ||
				entry.challenge !==
					createHash('sha256')
						.update(form.get('code_verifier') ?? '')
						.digest('base64url')
			)
				return send(400, { error: 'invalid_grant' });
			// No Graph access token: profile-photo requests must never leave this test fixture.
			send(200, {
				token_type: 'Bearer',
				access_token: '',
				expires_in: 3600,
				id_token: mint({ ...entry.claims, nonce: entry.nonce })
			});
		});
		return;
	}
	if (req.method === 'GET' && /^\/[^/]+\/discovery\/v2\.0\/keys$/.test(req.url ?? ''))
		return send(200, { keys: [jwk] });
	if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
	if (req.method === 'POST' && req.url === '/token') {
		let body = '';
		req.on('data', (chunk) => (body += chunk));
		req.on('end', () => send(200, { token: mint(JSON.parse(body || '{}')) }));
		return;
	}
	send(404, { error: 'not found' });
}).listen(port, '127.0.0.1', () => console.log(`fake entra on http://127.0.0.1:${port}`));
