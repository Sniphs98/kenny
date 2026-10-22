import { withBase, withoutBase } from '#lib/paths.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { intakeSubmissionSchema } from '#lib/contracts/index.js';
import { localizeError } from '#lib/i18n.js';
import { ApiError } from '#lib/server/errors.js';
import { getPublicForm, submitForm } from '#lib/server/services/intake.js';

function publicForm(token: string) {
	try {
		return getPublicForm(token);
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
}

export const load = async ({ params, locals, url }) => {
	const intake = publicForm(params.token);
	if (intake.requireLogin && !locals.user)
		redirect(303, withBase(`/login?redirect=${encodeURIComponent(withoutBase(url.pathname))}`));
	return {
		intake,
		signedInAs: locals.user?.name ?? null,
		form: await superValidate(zod4(intakeSubmissionSchema))
	};
};

export const actions = {
	default: async ({ request, params, locals, getClientAddress }) => {
		// Dateien kommen neben den Feldern im selben multipart-Formular
		const data = await request.formData();
		const files = data.getAll('attachments').filter((f): f is File => f instanceof File && f.size > 0);
		const inlineImages = data.getAll('inlineImages').filter((f): f is File => f instanceof File && f.size > 0);
		const inlineImageUrls = data.getAll('inlineImageUrls').map(String);
		data.delete('attachments');
		data.delete('inlineImages');
		data.delete('inlineImageUrls');
		const form = await superValidate(data, zod4(intakeSubmissionSchema));
		if (!form.valid) return fail(400, { form });
		try {
			const result = await submitForm(params.token, form.data, {
				user: locals.user ?? null,
				ip: getClientAddress(),
				files,
				inlineImages,
				inlineImageUrls
			});
			// Bei Bot-Einreichungen (Fallen-Feld) gibt es keinen Schlüssel; die Seite zeigt trotzdem „Danke“
			return {
				form,
				submitted: result.key ?? '',
				statusTicket:
					'statusPath' in result
						? {
								path: result.statusPath,
								status: result.status,
								closed: result.closed,
								updatedAt: result.updatedAt,
								projectName: result.projectName,
								projectColor: result.projectColor
							}
						: null
			};
		} catch (e) {
			if (e instanceof ApiError) return fail(e.status, { form: { ...form, message: e.message } });
			throw e;
		}
	}
};
