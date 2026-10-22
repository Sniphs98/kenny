import { asc, eq } from 'drizzle-orm';
import { ATTACHMENTS_DIR, BETTER_AUTH_URL } from '$app/env/private';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	EMAIL_NOTIFICATION_EVENTS,
	emailNotificationsDtoSchema,
	intakeFieldsSchema,
	updateEmailNotificationsSchema,
	type EmailNotificationEvent,
	type EmailNotificationsDto
} from '#lib/contracts/index.js';
import { m } from '#lib/paraglide/messages.js';
import { db } from '../db/index.js';
import {
	attachment,
	intakeForm,
	project,
	projectEmailNotification,
	tag,
	ticket,
	ticketAssignee,
	ticketTag,
	user
} from '../db/schema.js';
import { sendEmail, isSmtpConfigured, type MailAttachment } from '../email/smtp.js';
import { ApiError } from '../errors.js';
import { parseInput } from '../validation.js';
import { requireActiveUser, requireProjectAccess } from './access.js';
import { getProject } from './projects.js';
import { publicTicketStatusUrlToken } from './public-ticket-status.js';

type Locale = 'de' | 'en';
type Row = typeof projectEmailNotification.$inferSelect;

function requireAdminOf(projectRef: string | number, userId: string) {
	const p = getProject(projectRef);
	requireProjectAccess(userId, p.id, 'admin');
	return p;
}

const rowOf = (projectId: number) =>
	db.select().from(projectEmailNotification).where(eq(projectEmailNotification.projectId, projectId)).get();

function present(row: Row | undefined, projectName: string): EmailNotificationsDto {
	return emailNotificationsDtoSchema.parse({
		configured: !!row,
		smtpConfigured: isSmtpConfigured(),
		events: row?.events ?? [...EMAIL_NOTIFICATION_EVENTS],
		locale: row?.locale ?? 'de',
		senderName: row?.senderName || projectName,
		lastSentAt: row?.lastSentAt ?? null,
		lastError: row?.lastError ?? null
	});
}

export function getEmailNotifications(projectRef: string | number, userId: string) {
	const p = requireAdminOf(projectRef, userId);
	return present(rowOf(p.id), p.name);
}

export function updateEmailNotifications(projectRef: string | number, rawInput: unknown, userId: string) {
	const input = parseInput(updateEmailNotificationsSchema, rawInput);
	const p = requireAdminOf(projectRef, userId);
	if (input.enabled === false) {
		db.delete(projectEmailNotification).where(eq(projectEmailNotification.projectId, p.id)).run();
		return present(undefined, p.name);
	}
	const current = rowOf(p.id);
	const values = {
		events: input.events
			? EMAIL_NOTIFICATION_EVENTS.filter((event) => input.events!.includes(event))
			: (current?.events ?? [...EMAIL_NOTIFICATION_EVENTS]),
		locale: input.locale ?? current?.locale ?? 'de',
		senderName: (input.senderName ?? current?.senderName) || p.name
	};
	db.insert(projectEmailNotification)
		.values({ projectId: p.id, ...values })
		.onConflictDoUpdate({ target: projectEmailNotification.projectId, set: values })
		.run();
	return present(rowOf(p.id), p.name);
}

const baseUrl = () => (BETTER_AUTH_URL ?? '').replace(/\/+$/, '');

function ticketData(ticketId: number) {
	const row = db
		.select({
			id: ticket.id,
			number: ticket.number,
			title: ticket.title,
			description: ticket.description,
			priority: ticket.priority,
			startDate: ticket.startDate,
			dueDate: ticket.dueDate,
			system: ticket.systemName,
			key: project.key,
			project: project.name,
			color: project.color,
			formName: intakeForm.name,
			formFields: intakeForm.fields,
			intakeFormId: ticket.intakeFormId,
			reporterEmail: ticket.reporterEmail
		})
		.from(ticket)
		.innerJoin(project, eq(project.id, ticket.projectId))
		.innerJoin(intakeForm, eq(intakeForm.id, ticket.intakeFormId))
		.where(eq(ticket.id, ticketId))
		.get();
	if (!row?.intakeFormId || !row.reporterEmail) return null;
	const assignees = db
		.select({ name: user.name })
		.from(ticketAssignee)
		.innerJoin(user, eq(user.id, ticketAssignee.userId))
		.where(eq(ticketAssignee.ticketId, ticketId))
		.orderBy(asc(ticketAssignee.position))
		.all()
		.map(({ name }) => name)
		.join(', ');
	const tags = db
		.select({ name: tag.name })
		.from(ticketTag)
		.innerJoin(tag, eq(tag.id, ticketTag.tagId))
		.where(eq(ticketTag.ticketId, ticketId))
		.orderBy(asc(tag.name))
		.all()
		.map(({ name }) => name);
	const attachments = db
		.select({
			id: attachment.id,
			filename: attachment.filename,
			mimeType: attachment.mimeType,
			storageKey: attachment.storageKey
		})
		.from(attachment)
		.where(eq(attachment.ticketId, ticketId))
		.orderBy(asc(attachment.id))
		.all();
	const { design: _, fieldOrder: __, ...rawFields } = row.formFields;
	return {
		...row,
		fields: intakeFieldsSchema.parse(rawFields),
		assignees,
		tags,
		attachments,
		recipient: row.reporterEmail
	};
}

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				character as '&' | '<' | '>' | '"' | "'"
			]
	);

function priorityLabel(priority: string, locale: Locale) {
	const labels: Record<string, () => string> = {
		low: () => m.low({}, { locale }),
		medium: () => m.medium({}, { locale }),
		high: () => m.high({}, { locale }),
		urgent: () => m.urgent({}, { locale })
	};
	return labels[priority]?.() ?? priority;
}

function dateLabel(value: string, locale: Locale) {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
		new Date(`${value}T00:00:00Z`)
	);
}

function detailRows(data: NonNullable<ReturnType<typeof ticketData>>, locale: Locale) {
	const rows: [string, string, boolean?][] = [
		[m.title({}, { locale }), data.title],
		[m.project({}, { locale }), data.project]
	];
	if (data.fields.system !== 'hidden' && data.system) rows.push([m.system({}, { locale }), data.system]);
	if (data.fields.description !== 'hidden' && data.description)
		rows.push([m.description({}, { locale }), data.description, true]);
	if (data.fields.priority !== 'hidden')
		rows.push([m.priority_2({}, { locale }), priorityLabel(data.priority, locale)]);
	if (data.fields.startDate !== 'hidden' && data.startDate)
		rows.push([m.start({}, { locale }), dateLabel(data.startDate, locale)]);
	if (data.fields.dueDate !== 'hidden' && data.dueDate)
		rows.push([m.due({}, { locale }), dateLabel(data.dueDate, locale)]);
	if (data.fields.tags !== 'hidden' && data.tags.length) rows.push([m.tags({}, { locale }), data.tags.join(', ')]);
	if (data.fields.attachments !== 'hidden' && data.attachments.length)
		rows.push([m.attachments({}, { locale }), data.attachments.map(({ filename }) => filename).join(', ')]);
	if (data.assignees) rows.push([m.notification_assignee({}, { locale }), data.assignees]);
	return rows;
}

function markdownHtml(
	value: string,
	attachments: MailAttachment[],
	data: NonNullable<ReturnType<typeof ticketData>>,
	accent: string
) {
	const replacements: string[] = [];
	const withTokens = value.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (source, alt: string, url: string) => {
		const match = url.match(/(?:^|\/)api\/v1\/attachments\/(\d+)(?:\?.*)?$/);
		const file = match ? data.attachments.find(({ id }) => id === Number(match[1])) : undefined;
		if (!file || !file.mimeType.startsWith('image/')) return source;
		const cid = `kenny-attachment-${file.id}`;
		replacements.push(
			attachments.some((attachment) => attachment.cid === cid)
				? `<img src="cid:${cid}" alt="${escapeHtml(alt || file.filename)}" style="display:block;max-width:100%;height:auto;margin:12px 0;border-radius:8px;" />`
				: `<span style="color:#64748b;">📎 ${escapeHtml(alt || file.filename)}</span>`
		);
		return `\u0000${replacements.length - 1}\u0000`;
	});
	const withLinks = withTokens.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (source, label: string, url: string) => {
		const match = url.match(/(?:^|\/)api\/v1\/attachments\/(\d+)(?:\?.*)?$/);
		const file = match ? data.attachments.find(({ id }) => id === Number(match[1])) : undefined;
		if (file) replacements.push(`<span style="color:#475569;">📎 ${escapeHtml(label || file.filename)}</span>`);
		else {
			let href: URL;
			try {
				href = new URL(url, `${baseUrl()}/`);
			} catch {
				return source;
			}
			if (!['http:', 'https:'].includes(href.protocol)) return source;
			replacements.push(`<a href="${escapeHtml(href.href)}" style="color:${accent};font-weight:600;">${escapeHtml(label)}</a>`);
		}
		return `\u0000${replacements.length - 1}\u0000`;
	});
	let html = escapeHtml(withLinks)
		.replace(/`([^`\n]+)`/g, '<code style="padding:2px 5px;border-radius:4px;background:#e2e8f0;font-family:monospace;">$1</code>')
		.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
		.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
		.replace(/\n/g, '<br />');
	html = html.replace(/\u0000(\d+)\u0000/g, (_token, index: string) => replacements[Number(index)] ?? '');
	return html;
}

async function referencedAttachments(value: string | undefined, data: NonNullable<ReturnType<typeof ticketData>>) {
	if (!value) return [];
	const ids = new Set(
		[...value.matchAll(/(?:^|\/)api\/v1\/attachments\/(\d+)/g)].map((match) => Number(match[1]))
	);
	const files: MailAttachment[] = [];
	for (const file of data.attachments) {
		if (!ids.has(file.id)) continue;
		try {
			files.push({
				filename: file.filename,
				contentType: file.mimeType,
				content: await readFile(join(ATTACHMENTS_DIR || 'data/attachments', file.storageKey)),
				cid: file.mimeType.startsWith('image/') ? `kenny-attachment-${file.id}` : undefined
			});
		} catch {
			// Der Kommentar bleibt auch dann lesbar, wenn eine referenzierte Datei inzwischen fehlt.
		}
	}
	return files;
}

function emailColors(color: string) {
	const match = /^#([0-9a-f]{6})$/i.exec(color);
	if (!match)
		return { accent: '#292524', foreground: '#ffffff', soft: '#f5f5f4', border: '#d6d3d1' };
	const rgb = [0, 2, 4].map((index) => parseInt(match[1].slice(index, index + 2), 16));
	const luminance = (channels: number[]) => {
		const linear = channels.map((value) => {
			const channel = value / 255;
			return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
	};
	const usable = luminance(rgb) > 0.45 ? rgb.map((value) => Math.round(value * 0.65)) : rgb;
	const hex = (channels: number[]) =>
		`#${channels.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
	const mixWithWhite = (amount: number) => usable.map((value) => value + (255 - value) * amount);
	const accent = hex(usable);
	return {
		accent,
		foreground: luminance(usable) > 0.3 ? '#1c1917' : '#ffffff',
		soft: hex(mixWithWhite(0.92)),
		border: hex(mixWithWhite(0.78))
	};
}

function actionButton(url: string, label: string, accent: string, foreground: string) {
	return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(url)}" stroked="false" fillcolor="${accent}" arcsize="26%" style="width:170px;height:42px;v-text-anchor:middle;"><w:anchorlock/><center style="color:${foreground};font-family:Arial,sans-serif;font-size:14px;font-weight:700;">${escapeHtml(label)} &nbsp;&#8594;</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 18px;border-radius:11px;background:${accent};color:${foreground};font-size:14px;font-weight:700;line-height:1;text-decoration:none;">${escapeHtml(label)} &nbsp;&rarr;</a><!--<![endif]-->`;
}

async function brandAttachment(): Promise<MailAttachment> {
	const paths = [
		join(process.cwd(), 'build/client/brands/ecomplete_software_icon.png'),
		join(process.cwd(), 'static/brands/ecomplete_software_icon.png')
	];
	for (const path of paths) {
		try {
			return {
				filename: 'ecomplete-icon.png',
				contentType: 'image/png',
				content: await readFile(path),
				cid: 'ecomplete-brand'
			};
		} catch {
			// Produktion und Entwicklung legen statische Dateien an unterschiedlichen Orten ab.
		}
	}
	throw new Error('Das e.complete-Logo wurde nicht gefunden.');
}

function emailDocument({
	locale,
	preheader,
	headerTitle,
	headerSubtitle,
	content
}: {
	locale: Locale;
	preheader: string;
	headerTitle: string;
	headerSubtitle?: string;
	content: string;
}) {
	const footer = headerSubtitle ? `${headerTitle} · ${headerSubtitle}` : headerTitle;
	return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><style>@media only screen and (max-width:620px){.email-shell{padding:24px 12px!important}.email-card{border-radius:16px!important}.email-content{padding:28px 20px!important}.detail-label,.detail-value{display:block!important;width:auto!important}.detail-label{padding-bottom:3px!important}.detail-value{padding-top:0!important}}</style></head><body style="margin:0;padding:0;background:#fafaf9;color:#1c1917;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#fafaf9;"><tr><td class="email-shell" style="padding:44px 16px;text-align:center;"><!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" align="center"><tr><td><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" align="center" style="width:100%;max-width:600px;margin:0 auto;border-collapse:separate;text-align:left;"><tr><td style="padding:0 4px 24px;"><table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td style="width:44px;vertical-align:middle;"><img src="cid:ecomplete-brand" width="44" alt="e.complete" style="display:block;width:44px;height:44px;border:0;"></td><td style="padding-left:14px;vertical-align:middle;"><div style="color:#292524;font-size:16px;font-weight:700;line-height:1.3;">${escapeHtml(headerTitle)}</div>${headerSubtitle ? `<div style="margin-top:3px;color:#78716c;font-size:13px;line-height:1.35;">${escapeHtml(headerSubtitle)}</div>` : ''}</td></tr></table></td></tr><tr><td><div class="email-card" style="overflow:hidden;border:1px solid #e7e5e4;border-radius:20px;background:#ffffff;box-shadow:0 12px 32px rgba(28,25,23,.06);">${content}</div></td></tr><tr><td style="padding:20px 8px 0;color:#a8a29e;font-size:12px;line-height:1.5;text-align:center;">${escapeHtml(footer)}</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}

function htmlFor(
	event: EmailNotificationEvent,
	subject: string,
	data: NonNullable<ReturnType<typeof ticketData>>,
	locale: Locale,
	comment: { body: string; authorName: string } | undefined,
	attachments: MailAttachment[]
) {
	const intro = {
		created: () => m.email_notification_created_intro({}, { locale }),
		closed: () => m.email_notification_closed_intro({}, { locale }),
		public_comment: () => m.email_notification_comment_intro({}, { locale })
	}[event]();
	const { accent, foreground } = emailColors(data.color);
	const accessToken = publicTicketStatusUrlToken(data.id);
	const url = `${baseUrl()}/status/${data.key}-${data.number}/${accessToken}`;
	const key = `${data.key}-${data.number}`;
	const eventLabel = {
		created: () => m.email_notification_event_created({}, { locale }),
		closed: () => m.email_notification_event_closed({}, { locale }),
		public_comment: () => m.email_notification_event_public_comment({}, { locale })
	}[event]();
	const rows = detailRows(data, locale)
		.map(
			([label, value, markdown], index, values) => `<tr><td class="detail-label" style="width:31%;padding:13px 0;color:#78716c;font-size:12px;font-weight:600;line-height:1.5;vertical-align:top;${index < values.length - 1 ? 'border-bottom:1px solid #e7e5e4;' : ''}">${escapeHtml(label)}</td><td class="detail-value" style="padding:13px 0 13px 18px;color:#292524;font-size:14px;line-height:1.5;vertical-align:top;white-space:pre-wrap;${index < values.length - 1 ? 'border-bottom:1px solid #e7e5e4;' : ''}">${markdown ? markdownHtml(value, attachments, data, accent) : escapeHtml(value)}</td></tr>`
		)
		.join('');
	const commentCard = comment
		? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr><td style="width:3px;background:${accent};font-size:0;line-height:0;">&nbsp;</td><td style="padding:2px 0 2px 18px;"><div style="margin-bottom:8px;color:#78716c;font-size:12px;font-weight:700;">${escapeHtml(comment.authorName)}</div><div style="color:#292524;font-size:15px;line-height:1.7;">${markdownHtml(comment.body, attachments, data, accent)}</div></td></tr></table>`
		: '';
	const details = event === 'public_comment' ? '' : `<div style="margin-top:30px;"><h2 style="margin:0 0 6px;color:#44403c;font-size:13px;font-weight:700;letter-spacing:.02em;">${escapeHtml(m.email_notification_details({}, { locale }))}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;border-collapse:collapse;">${rows}</table></div>`;
	const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr><td class="email-content" style="padding:38px;"><div style="margin:0 0 16px;color:#78716c;font-size:12px;font-weight:700;letter-spacing:.02em;"><span style="color:${accent};">${escapeHtml(key)}</span>&nbsp;&nbsp;&middot;&nbsp;&nbsp;${escapeHtml(eventLabel)}</div><h1 style="margin:0 0 12px;color:#1c1917;font-size:24px;font-weight:700;letter-spacing:-.4px;line-height:1.3;">${escapeHtml(subject)}</h1><p style="margin:0 0 28px;color:#57534e;font-size:15px;line-height:1.65;">${escapeHtml(intro)}</p>${commentCard}${details}<div style="margin-top:30px;">${actionButton(url, m.email_notification_open({}, { locale }), accent, foreground)}</div></td></tr></table>`;
	return emailDocument({
		locale,
		preheader: intro,
		headerTitle: data.project,
		headerSubtitle: data.formName,
		content
	});
}

function testEmailHtml(projectName: string, color: string, locale: Locale) {
	const subject = m.email_notification_test_subject({ project: projectName }, { locale });
	const text = m.email_notification_test_text({ project: projectName }, { locale });
	const { accent } = emailColors(color);
	const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr><td class="email-content" style="padding:38px;"><div style="margin-bottom:16px;color:${accent};font-size:12px;font-weight:700;">${escapeHtml(projectName)}</div><h1 style="margin:0 0 12px;color:#1c1917;font-size:24px;font-weight:700;letter-spacing:-.4px;line-height:1.3;">${escapeHtml(subject)}</h1><p style="margin:0;color:#57534e;font-size:15px;line-height:1.65;">${escapeHtml(text)}</p></td></tr></table>`;
	return emailDocument({ locale, preheader: text, headerTitle: projectName, content });
}

async function mailFor(
	event: EmailNotificationEvent,
	ticketId: number,
	locale: Locale,
	senderName: string,
	comment?: { body: string; authorName: string }
) {
	const data = ticketData(ticketId);
	if (!data) return null;
	const key = `${data.key}-${data.number}`;
	const subject = {
		created: () => m.email_notification_created_subject({ title: data.title }, { locale }),
		closed: () => m.email_notification_closed_subject({ title: data.title }, { locale }),
		public_comment: () => m.email_notification_comment_subject({ title: data.title }, { locale })
	}[event]();
	const intro = {
		created: () => m.email_notification_created_intro({}, { locale }),
		closed: () => m.email_notification_closed_intro({}, { locale }),
		public_comment: () => m.email_notification_comment_intro({}, { locale })
	}[event]();
	const lines = [subject, '', intro];
	if (event !== 'public_comment') lines.push('', ...detailRows(data, locale).map(([label, value]) => `${label}: ${value}`));
	if (comment) lines.push('', `${comment.authorName}:`, comment.body);
	const accessToken = publicTicketStatusUrlToken(data.id);
	lines.push('', `${m.email_notification_open({}, { locale })}: ${baseUrl()}/status/${key}/${accessToken}`);
	const attachmentSource = comment?.body ?? (event === 'public_comment' ? undefined : data.description ?? undefined);
	const attachments = [await brandAttachment(), ...(await referencedAttachments(attachmentSource, data))];
	return {
		to: data.recipient,
		fromName: senderName || data.project,
		subject,
		text: lines.join('\n'),
		html: htmlFor(event, subject, data, locale, comment, attachments),
		attachments
	};
}

const inFlight = new Set<Promise<void>>();

export async function settleEmailNotifications() {
	await Promise.allSettled([...inFlight]);
}

async function deliver(
	row: Row,
	mail: {
		to: string;
		fromName?: string;
		subject: string;
		text: string;
		html?: string;
		attachments?: MailAttachment[];
	}
) {
	let error: string | null = null;
	try {
		await sendEmail(mail);
	} catch (reason) {
		error = (reason instanceof Error ? reason.message : String(reason)).slice(0, 300);
		console.error(`E-Mail-Benachrichtigung für Projekt ${row.projectId} fehlgeschlagen: ${error}`);
	}
	db.update(projectEmailNotification)
		.set(error ? { lastError: error } : { lastError: null, lastSentAt: new Date() })
		.where(eq(projectEmailNotification.projectId, row.projectId))
		.run();
	if (error) throw new Error(error);
}

export function notifyEmail(
	event: EmailNotificationEvent,
	projectId: number,
	ticketId: number,
	comment?: { body: string; authorName: string }
) {
	const row = rowOf(projectId);
	if (!row?.events.includes(event)) return;
	const delivery = (async () => {
		const mail = await mailFor(event, ticketId, row.locale, row.senderName, comment);
		if (mail) await deliver(row, mail);
	})().catch(() => {});
	inFlight.add(delivery);
	void delivery.finally(() => inFlight.delete(delivery));
}

export async function sendTestEmailNotification(projectRef: string | number, userId: string) {
	const p = requireAdminOf(projectRef, userId);
	const row = rowOf(p.id);
	if (!row) throw new ApiError(409, 'Für dieses Projekt sind keine E-Mail-Benachrichtigungen eingerichtet.');
	try {
		await deliver(row, {
			to: requireActiveUser(userId).email,
			fromName: row.senderName || p.name,
			subject: m.email_notification_test_subject({ project: p.name }, { locale: row.locale }),
			text: m.email_notification_test_text({ project: p.name }, { locale: row.locale }),
			html: testEmailHtml(p.name, p.color, row.locale),
			attachments: [await brandAttachment()]
		});
	} catch (reason) {
		throw new ApiError(502, `Test-E-Mail fehlgeschlagen: ${reason instanceof Error ? reason.message : String(reason)}`);
	}
	return present(rowOf(p.id), p.name);
}
