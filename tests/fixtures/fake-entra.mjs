// Nachgebautes Microsoft Entra ID für die Teams-E2E-Tests: liefert Signaturschlüssel wie
// https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys und signiert Tokens auf Anfrage.
// Nur für Tests; Kenny spricht es über MICROSOFT_AUTHORITY an.
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_ENTRA_PORT || 4176);
const kid = 'kenny-e2e-key';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };

const base64url = (value) =>
	Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

function mint(claims) {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url({ alg: 'RS256', typ: 'JWT', kid });
	const payload = base64url({ iat: now, nbf: now, exp: now + 3600, ver: '2.0', ...claims });
	const signature = sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
	return `${header}.${payload}.${signature}`;
}

createServer((req, res) => {
	const send = (status, body) => {
		res.writeHead(status, { 'content-type': 'application/json' });
		res.end(JSON.stringify(body));
	};
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
