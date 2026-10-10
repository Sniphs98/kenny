import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { protectFraming } from '$lib/server/framing';
import {
	TEAMS_FRAME_ANCESTORS,
	applicationIdUri,
	colorIcon,
	crc32,
	outlineIcon,
	teamsManifest,
	teamsPackage,
	type TeamsConfig
} from '$lib/server/teams';
import { safeTarget } from '$lib/safe-target';

const config: TeamsConfig = {
	baseUrl: 'https://kenny.firma.intern',
	clientId: '0f6c1a5e-1111-2222-3333-444455556666',
	appId: '9a1b2c3d-0000-4000-8000-000000000001',
	version: '1.2.0',
	developer: 'Firma GmbH'
};

/** Dateien eines ZIP-Archivs (nur Methode „stored“, wie teamsPackage sie schreibt) */
function unzip(archive: Buffer) {
	const files: Record<string, Buffer> = {};
	let offset = 0;
	while (archive.readUInt32LE(offset) === 0x04034b50) {
		const crc = archive.readUInt32LE(offset + 14);
		const size = archive.readUInt32LE(offset + 18);
		const nameLength = archive.readUInt16LE(offset + 26);
		const extraLength = archive.readUInt16LE(offset + 28);
		const name = archive.toString('utf8', offset + 30, offset + 30 + nameLength);
		const data = archive.subarray(
			offset + 30 + nameLength + extraLength,
			offset + 30 + nameLength + extraLength + size
		);
		expect(crc32(data), name).toBe(crc);
		files[name] = data;
		offset += 30 + nameLength + extraLength + size;
	}
	expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
	return files;
}

/** Breite, Höhe und RGBA-Pixel eines PNG ohne Filter (wie colorIcon/outlineIcon sie schreiben) */
function readPng(png: Buffer) {
	expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const width = png.readUInt32BE(16);
	const height = png.readUInt32BE(20);
	const idatLength = png.readUInt32BE(33);
	expect(png.toString('ascii', 37, 41)).toBe('IDAT');
	const raw = inflateSync(png.subarray(41, 41 + idatLength));
	const pixel = (x: number, y: number) => [...raw.subarray(y * (width * 4 + 1) + 1 + x * 4).subarray(0, 4)];
	return { width, height, pixel };
}

describe('teams app package', () => {
	it('describes personal and channel tabs with SSO for the configured host', () => {
		const manifest = teamsManifest(config);
		expect(manifest).toMatchObject({
			manifestVersion: '1.19',
			id: config.appId,
			version: '1.2.0',
			developer: { name: 'Firma GmbH', websiteUrl: 'https://kenny.firma.intern' },
			validDomains: ['kenny.firma.intern'],
			webApplicationInfo: {
				id: config.clientId,
				resource: 'api://kenny.firma.intern/0f6c1a5e-1111-2222-3333-444455556666'
			}
		});
		expect(manifest.staticTabs).toEqual([
			expect.objectContaining({ contentUrl: 'https://kenny.firma.intern/teams?to=%2F', scopes: ['personal'] })
		]);
		expect(manifest.configurableTabs).toEqual([
			expect.objectContaining({
				configurationUrl: 'https://kenny.firma.intern/teams/config',
				scopes: ['team', 'groupChat']
			})
		]);
		expect(applicationIdUri({ baseUrl: 'https://kenny.firma.intern:8443', clientId: 'abc' })).toBe(
			'api://kenny.firma.intern:8443/abc'
		);
	});

	it('packs manifest and icons in the sizes Teams requires', () => {
		const files = unzip(teamsPackage(config));
		expect(Object.keys(files).sort()).toEqual(['color.png', 'manifest.json', 'outline.png']);
		expect(JSON.parse(files['manifest.json'].toString('utf8')).id).toBe(config.appId);

		const color = readPng(colorIcon());
		expect([color.width, color.height]).toEqual([192, 192]);
		expect(color.pixel(96, 10)).toEqual([28, 25, 23, 255]);
		expect(color.pixel(0, 0)[3]).toBe(0);

		// Umriss-Icon: nur Weiß oder vollständig transparent
		const outline = readPng(outlineIcon());
		expect([outline.width, outline.height]).toEqual([32, 32]);
		for (let y = 0; y < 32; y++)
			for (let x = 0; x < 32; x++)
				expect([
					[255, 255, 255, 255],
					[0, 0, 0, 0]
				]).toContainEqual(outline.pixel(x, y));
	});
});

describe('framing in teams mode', () => {
	it('lets only Teams and Microsoft 365 hosts frame the app', () => {
		const headers = new Headers({ 'x-frame-options': 'DENY' });
		protectFraming('/projects/WEB/board', headers, TEAMS_FRAME_ANCESTORS);
		expect(headers.get('x-frame-options')).toBeNull();
		expect(headers.get('content-security-policy')).toBe(`frame-ancestors 'self' ${TEAMS_FRAME_ANCESTORS.join(' ')}`);
		expect(TEAMS_FRAME_ANCESTORS.every((host) => host.startsWith('https://'))).toBe(true);

		const off = new Headers();
		protectFraming('/projects/WEB/board', off);
		expect(off.get('content-security-policy')).toBe("frame-ancestors 'none'");
	});
});

describe('teams redirect target', () => {
	it('only follows paths inside Kenny', () => {
		expect(safeTarget('/projects/WEB/board')).toBe('/projects/WEB/board');
		expect(safeTarget(null)).toBe('/');
		for (const evil of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])
			expect(safeTarget(evil), evil).toBe('/');
	});
});
