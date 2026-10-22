import { SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURE, SMTP_USER } from '$app/env/private';
import { once } from 'node:events';
import * as net from 'node:net';
import * as tls from 'node:tls';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { randomUUID } from 'node:crypto';

export type MailAttachment = {
	filename: string;
	contentType: string;
	content: Buffer;
	cid?: string;
};
type Mail = {
	to: string;
	fromName?: string;
	subject: string;
	text: string;
	html?: string;
	attachments?: MailAttachment[];
};
type SmtpConfig = {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	password: string;
	from: string;
};

function config(): SmtpConfig | null {
	const user = SMTP_USER.trim();
	const password = SMTP_PASSWORD;
	if (!user || !password) return null;
	const port = Number(SMTP_PORT || 465);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT ist ungültig.');
	const from = SMTP_FROM.trim() || user;
	if (!/^[^\s@<>]+@[^\s@<>]+$/.test(from)) throw new Error('SMTP_FROM ist ungültig.');
	return {
		host: SMTP_HOST.trim() || 'smtp.gmail.com',
		port,
		secure: SMTP_SECURE ? SMTP_SECURE.toLowerCase() !== 'false' : port === 465,
		user,
		password,
		from
	};
}

export const isSmtpConfigured = () => {
	try {
		return config() !== null;
	} catch {
		return false;
	}
};

function lineReader(socket: Socket | TLSSocket) {
	let buffer = '';
	const lines: string[] = [];
	const waiters: { resolve: (line: string) => void; reject: (error: Error) => void }[] = [];
	socket.setEncoding('utf8');
	socket.on('data', (chunk: string) => {
		buffer += chunk;
		let end = buffer.indexOf('\r\n');
		while (end >= 0) {
			const line = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			const waiter = waiters.shift();
			if (waiter) waiter.resolve(line);
			else lines.push(line);
			end = buffer.indexOf('\r\n');
		}
	});
	const rejectWaiters = (reason: Error) => {
		for (const waiter of waiters.splice(0)) waiter.reject(reason);
	};
	socket.on('error', rejectWaiters);
	socket.on('close', () => rejectWaiters(new Error('SMTP-Verbindung wurde beendet.')));
	return () =>
		lines.length
			? Promise.resolve(lines.shift()!)
			: new Promise<string>((resolve, reject) => waiters.push({ resolve, reject }));
}

async function response(readLine: () => Promise<string>, expected: number[]) {
	const first = await readLine();
	const match = first.match(/^(\d{3})([ -])/);
	if (!match) throw new Error(`Ungültige SMTP-Antwort: ${first}`);
	const code = Number(match[1]);
	let last = first;
	while (match[2] === '-' && !last.startsWith(`${code} `)) last = await readLine();
	if (!expected.includes(code)) throw new Error(`SMTP ${code}: ${last.slice(4)}`);
}

async function command(socket: Socket | TLSSocket, readLine: () => Promise<string>, value: string, expected: number[]) {
	socket.write(`${value}\r\n`);
	await response(readLine, expected);
}

function base64Lines(value: string | Buffer) {
	return (Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'))
		.toString('base64')
		.match(/.{1,76}/g)!
		.join('\r\n');
}

function attachmentPart(boundary: string, attachment: MailAttachment) {
	const filename = encodeURIComponent(attachment.filename);
	return [
		`--${boundary}`,
		`Content-Type: ${attachment.contentType}; name*=UTF-8''${filename}`,
		'Content-Transfer-Encoding: base64',
		`Content-Disposition: ${attachment.cid ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
		...(attachment.cid ? [`Content-ID: <${attachment.cid}>`] : []),
		'',
		base64Lines(attachment.content)
	];
}

function message(mail: Mail, from: string) {
	const fromDomain = from.split('@')[1] || 'localhost';
	const fromName = mail.fromName?.replace(/[\r\n]+/g, ' ').trim();
	const fromHeader = fromName ? `=?UTF-8?B?${Buffer.from(fromName).toString('base64')}?= <${from}>` : `<${from}>`;
	const headers = [
		`From: ${fromHeader}`,
		`To: ${mail.to}`,
		`Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString('base64')}?=`,
		`Date: ${new Date().toUTCString()}`,
		`Message-ID: <${randomUUID()}@${fromDomain}>`,
		'MIME-Version: 1.0'
	];
	if (!mail.html)
		return [
			...headers,
			'Content-Type: text/plain; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			base64Lines(mail.text),
			'.'
		].join('\r\n');
	const alternativeBoundary = `kenny-alternative-${randomUUID()}`;
	const alternative = [
		`--${alternativeBoundary}`,
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		base64Lines(mail.text),
		`--${alternativeBoundary}`,
		'Content-Type: text/html; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		base64Lines(mail.html),
		`--${alternativeBoundary}--`
	];
	if (!mail.attachments?.length)
		return [
			...headers,
			`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
			'',
			...alternative,
			'.'
		].join('\r\n');
	const mixedBoundary = `kenny-mixed-${randomUUID()}`;
	return [
		...headers,
		`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
		'',
		`--${mixedBoundary}`,
		`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
		'',
		...alternative,
		...mail.attachments.flatMap((attachment) => attachmentPart(mixedBoundary, attachment)),
		`--${mixedBoundary}--`,
		'.'
	].join('\r\n');
}

/** Kleine SMTP-Implementierung für Gmail und kompatible Server (TLS 465 oder STARTTLS 587). */
export async function sendEmail(mail: Mail) {
	const smtp = config();
	if (!smtp) throw new Error('SMTP ist nicht konfiguriert.');
	const timeout = 10_000;
	let socket: Socket | TLSSocket = smtp.secure
		? tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host })
		: net.connect({ host: smtp.host, port: smtp.port });
	socket.setTimeout(timeout, () => socket.destroy(new Error('SMTP-Zeitüberschreitung.')));
	try {
		let readLine = lineReader(socket);
		await once(socket, smtp.secure ? 'secureConnect' : 'connect');
		await response(readLine, [220]);
		await command(socket, readLine, 'EHLO kenny', [250]);
		if (!smtp.secure) {
			await command(socket, readLine, 'STARTTLS', [220]);
			socket.removeAllListeners('data');
			socket = tls.connect({ socket, servername: smtp.host });
			socket.setTimeout(timeout, () => socket.destroy(new Error('SMTP-Zeitüberschreitung.')));
			readLine = lineReader(socket);
			await once(socket, 'secureConnect');
			await command(socket, readLine, 'EHLO kenny', [250]);
		}
		const auth = Buffer.from(`\0${smtp.user}\0${smtp.password}`).toString('base64');
		await command(socket, readLine, `AUTH PLAIN ${auth}`, [235]);
		await command(socket, readLine, `MAIL FROM:<${smtp.from}>`, [250]);
		await command(socket, readLine, `RCPT TO:<${mail.to}>`, [250, 251]);
		await command(socket, readLine, 'DATA', [354]);
		socket.write(`${message(mail, smtp.from)}\r\n`);
		await response(readLine, [250]);
		await command(socket, readLine, 'QUIT', [221]);
	} finally {
		socket.destroy();
	}
}
