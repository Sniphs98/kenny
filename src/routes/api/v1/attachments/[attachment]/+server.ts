import { apiHandler } from '$lib/server/api';
import { deleteAttachment, downloadAttachment } from '$lib/server/services/attachments';

/** Datei abrufen; ?download erzwingt den Download auch bei Bildern */
export const GET = apiHandler((e) =>
	downloadAttachment(Number(e.params.attachment), e.url.searchParams.has('download'))
);
export const DELETE = apiHandler((e) => deleteAttachment(Number(e.params.attachment)));
