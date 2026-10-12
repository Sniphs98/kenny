import { apiHandler } from '#lib/server/api.js';
import { ApiError } from '#lib/server/errors.js';
import { addAttachments, listAttachments } from '#lib/server/services/attachments.js';
import { resolveTicket } from '#lib/server/services/tickets.js';

export const GET = apiHandler((e) => listAttachments(resolveTicket(e.params.ticket!).id));

/**
 * Dateien hochladen, zwei Varianten:
 * - multipart/form-data mit einem oder mehreren Feldern "file" (Browser)
 * - Datei direkt als Body mit ?filename=bild.png (Skripte; nicht vom CSRF-Schutz für Formulare betroffen)
 */
export const POST = apiHandler(
	async (e, user) => {
		const type = e.request.headers.get('content-type') ?? '';
		if (type.startsWith('multipart/form-data')) {
			let form: FormData;
			try {
				form = await e.request.formData();
			} catch {
				throw new ApiError(400, 'Ungültiges multipart/form-data.');
			}
			const files = form.getAll('file').filter((f): f is File => f instanceof File);
			return addAttachments(e.params.ticket!, files, user.id);
		}
		const filename = e.url.searchParams.get('filename');
		if (!filename)
			throw new ApiError(
				400,
				'Entweder multipart/form-data mit Feld "file" oder ?filename=… mit der Datei als Body senden.'
			);
		const file = new File([await e.request.arrayBuffer()], filename, {
			type: type.split(';')[0] || 'application/octet-stream'
		});
		return addAttachments(e.params.ticket!, [file], user.id);
	},
	{ status: 201 }
);
