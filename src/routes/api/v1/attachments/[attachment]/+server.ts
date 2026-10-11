import { apiHandler } from '#lib/server/api.js';
import { deleteAttachment, downloadAttachment } from '#lib/server/services/attachments.js';

/** Datei abrufen; ?download erzwingt den Download auch bei Bildern */
export const GET = apiHandler((e) =>
	downloadAttachment(Number(e.params.attachment), e.url.searchParams.has('download'))
);
export const DELETE = apiHandler((e) => deleteAttachment(Number(e.params.attachment)));
