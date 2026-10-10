import { localizeError } from '$lib/i18n';
import { fail, error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { intakeFormSchema } from '$lib/contracts';
import { ApiError } from '$lib/server/errors';
import { createForm, deleteForm, listForms, regenerateToken, updateForm } from '$lib/server/services/intake';
import { requireAdmin } from '$lib/server/services/access';
import { listProjects } from '$lib/server/services/projects';
import { listTags } from '$lib/server/services/tags';

function authorize(userId: string) {
	try {
		requireAdmin(userId);
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
}

export const load = async ({ locals }) => {
	authorize(locals.user!.id);
	return {
		forms: listForms(locals.user!.id),
		projects: listProjects().map(({ id, key, name, color }) => ({
			id,
			key,
			name,
			color,
			tags: listTags(id).map(({ id, name, color }) => ({ id, name, color }))
		})),
		form: await superValidate(zod4(intakeFormSchema))
	};
};

/** Formular-ID aus einem einfachen POST (Löschen, Link neu erzeugen) */
async function formId(request: Request) {
	return Number((await request.formData()).get('id'));
}

function failed(e: unknown) {
	if (e instanceof ApiError) return fail(e.status, { error: e.message });
	throw e;
}

export const actions = {
	/** Anlegen (ohne ?id) oder ändern (?/save&id=3) */
	save: async ({ request, url, locals }) => {
		authorize(locals.user!.id);
		const form = await superValidate(request, zod4(intakeFormSchema));
		if (!form.valid) return fail(400, { form });
		const id = Number(url.searchParams.get('id'));
		try {
			if (id) updateForm(id, form.data, locals.user!.id);
			else createForm(form.data, locals.user!.id);
		} catch (e) {
			if (e instanceof ApiError) return fail(e.status, { form: { ...form, message: e.message } });
			throw e;
		}
		return { form };
	},
	regenerate: async ({ request, locals }) => {
		authorize(locals.user!.id);
		try {
			regenerateToken(await formId(request), locals.user!.id);
		} catch (e) {
			return failed(e);
		}
	},
	delete: async ({ request, locals }) => {
		authorize(locals.user!.id);
		try {
			deleteForm(await formId(request), locals.user!.id);
		} catch (e) {
			return failed(e);
		}
	}
};
