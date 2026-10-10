import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { env } from '$env/dynamic/private';

/**
 * Microsoft Teams: Kenny als Teams-App (persönlicher Tab und Kanal-Tab) mit Anmeldung per Teams-SSO.
 * Aktiv nur mit TEAMS_ENABLED=true und eingerichtetem Microsoft-Login (siehe docs/microsoft-teams.md).
 */

/** Teams-Clients, die SSO-Tokens für Kenny anfordern dürfen (in Entra ID vorab autorisieren) */
export const TEAMS_CLIENT_IDS = {
	'Teams Desktop und Mobil': '1fec8e78-bce4-4aaf-ab1b-5451cc387264',
	'Teams im Browser': '5e3ce6c0-2b1f-4285-8d4b-75ee78787346'
} as const;

/** Hosts, die Kenny-Seiten im Teams-Modus einbetten dürfen (Teams, Microsoft 365, Outlook) */
export const TEAMS_FRAME_ANCESTORS = [
	'https://teams.microsoft.com',
	'https://*.teams.microsoft.com',
	'https://*.teams.cloud.microsoft',
	'https://*.cloud.microsoft',
	'https://*.office.com',
	'https://*.microsoft365.com',
	'https://outlook.office.com',
	'https://outlook.office365.com'
];

export type TeamsConfig = {
	/** Öffentliche Basis-URL von Kenny ohne Schrägstrich am Ende */
	baseUrl: string;
	clientId: string;
	appId: string;
	version: string;
	developer: string;
};

/** Ist Microsoft-Login eingerichtet (Voraussetzung für Teams-SSO)? */
export const microsoftConfigured = () => !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);

export const teamsEnabled = () => env.TEAMS_ENABLED === 'true' && microsoftConfigured();

/** UUID-förmige, stabile ID aus einem Text: dasselbe Kenny ergibt bei jedem Download dieselbe Teams-App */
function stableUuid(seed: string) {
	const h = createHash('sha256').update(seed).digest('hex');
	const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function teamsConfig(): TeamsConfig {
	const baseUrl = (env.BETTER_AUTH_URL ?? '').replace(/\/+$/, '');
	const clientId = env.MICROSOFT_CLIENT_ID ?? '';
	return {
		baseUrl,
		clientId,
		appId: env.TEAMS_APP_ID || stableUuid(`kenny-teams:${baseUrl}:${clientId}`),
		version: env.TEAMS_APP_VERSION || '1.0.0',
		developer: env.TEAMS_DEVELOPER_NAME || 'Kenny'
	};
}

/** Application ID URI, die in Entra ID unter „Expose an API“ eingetragen werden muss */
export const applicationIdUri = (c: Pick<TeamsConfig, 'baseUrl' | 'clientId'>) =>
	`api://${new URL(c.baseUrl).host}/${c.clientId}`;

/** Teams-App-Manifest (Schema 1.19) mit persönlichem Tab, Kanal-Tab und SSO */
export function teamsManifest(c: TeamsConfig) {
	const host = new URL(c.baseUrl).host;
	return {
		$schema: 'https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json',
		manifestVersion: '1.19',
		version: c.version,
		id: c.appId,
		developer: {
			name: c.developer,
			websiteUrl: c.baseUrl,
			privacyUrl: c.baseUrl,
			termsOfUseUrl: c.baseUrl
		},
		name: { short: 'Kenny', full: 'Kenny – Projekte und Tickets' },
		description: {
			short: 'Kanban-Boards, Gantt und Tickets direkt in Teams.',
			full: 'Kenny bringt Projekte, Kanban-Boards, Gantt-Diagramme und Tickets in Microsoft Teams: als persönliche App und als Kanal-Tab für ein Projekt. Die Anmeldung erfolgt automatisch mit dem Microsoft-Konto.'
		},
		icons: { color: 'color.png', outline: 'outline.png' },
		accentColor: '#1C1917',
		staticTabs: [
			{
				entityId: 'kenny-home',
				name: 'Kenny',
				contentUrl: `${c.baseUrl}/teams?to=%2F`,
				websiteUrl: c.baseUrl,
				scopes: ['personal']
			}
		],
		configurableTabs: [
			{
				configurationUrl: `${c.baseUrl}/teams/config`,
				canUpdateConfiguration: true,
				scopes: ['team', 'groupChat']
			}
		],
		permissions: ['identity'],
		validDomains: [host],
		webApplicationInfo: { id: c.clientId, resource: applicationIdUri(c) }
	};
}

// --- Icons: PNG ohne Bildbibliothek ---------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

export function crc32(data: Uint8Array) {
	let c = 0xffffffff;
	for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

/** RGBA-Bild als PNG; pixel(x, y) liefert [r, g, b, a] */
function png(size: number, pixel: (x: number, y: number) => [number, number, number, number]) {
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) {
		const row = y * (size * 4 + 1);
		for (let x = 0; x < size; x++) raw.set(pixel(x, y), row + 1 + x * 4);
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header.set([8, 6, 0, 0, 0], 8); // 8 Bit, RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', header),
		pngChunk('IDAT', deflateSync(raw)),
		pngChunk('IEND', Buffer.alloc(0))
	]);
}

/** Kanban-Symbol: drei Spalten unterschiedlicher Höhe in einem Quadrat der Kantenlänge 1 */
function kanban(u: number, v: number) {
	const columns = [
		[0.22, 0.38, 0.72],
		[0.43, 0.59, 0.55],
		[0.64, 0.8, 0.86]
	];
	return columns.some(([from, to, bottom]) => u >= from && u < to && v >= 0.22 && v < bottom);
}

/** Farbiges App-Icon 192×192: weißes Kanban-Symbol auf dunklem, abgerundetem Quadrat */
export function colorIcon() {
	const size = 192;
	const radius = 40;
	return png(size, (x, y) => {
		const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
		const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
		if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
		return kanban(x / size, y / size) ? [255, 255, 255, 255] : [28, 25, 23, 255];
	});
}

/** Umriss-Icon 32×32 für die Teams-Leiste: nur Weiß auf transparentem Hintergrund */
export function outlineIcon() {
	const size = 32;
	return png(size, (x, y) => (kanban((x + 0.5) / size, (y + 0.5) / size) ? [255, 255, 255, 255] : [0, 0, 0, 0]));
}

// --- ZIP ohne Bibliothek (Methode „stored“, reicht für drei kleine Dateien) -----------------------

export function zip(files: Record<string, Uint8Array>) {
	const local: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const [name, content] of Object.entries(files)) {
		const nameBytes = Buffer.from(name, 'utf8');
		const data = Buffer.from(content);
		const crc = crc32(data);
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0);
		header.writeUInt16LE(20, 4); // benötigte Version
		header.writeUInt16LE(0x0800, 6); // UTF-8-Dateinamen
		header.writeUInt16LE(0, 8); // stored
		header.writeUInt32LE(crc, 14);
		header.writeUInt32LE(data.length, 18);
		header.writeUInt32LE(data.length, 22);
		header.writeUInt16LE(nameBytes.length, 26);
		local.push(header, nameBytes, data);

		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		entry.writeUInt16LE(20, 6);
		entry.writeUInt16LE(0x0800, 8);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(data.length, 20);
		entry.writeUInt32LE(data.length, 24);
		entry.writeUInt16LE(nameBytes.length, 28);
		entry.writeUInt32LE(offset, 42);
		central.push(entry, nameBytes);
		offset += header.length + nameBytes.length + data.length;
	}
	const directory = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(Object.keys(files).length, 8);
	end.writeUInt16LE(Object.keys(files).length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, directory, end]);
}

/** App-Paket zum Hochladen in Teams (Manifest und Icons) */
export function teamsPackage(c: TeamsConfig) {
	return zip({
		'manifest.json': Buffer.from(JSON.stringify(teamsManifest(c), null, 2)),
		'color.png': colorIcon(),
		'outline.png': outlineIcon()
	});
}
