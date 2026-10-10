import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { intakeFormSchema } from '$lib/contracts';
import { ApiError } from '$lib/server/errors';
import {
	createForm,
	deleteForm,
	listForms,
	manageableProjectIds,
	regenerateToken,
	updateForm
} from '$lib/server/services/intake';
import { listProjects } from '$lib/server/services/projects';

export const load = async ({ locals }) => {
	const userId = locals.user!.id;
	// Nur Projekte, die der Benutzer verwaltet, dürfen in Formularen stehen
	const allowed = manageableProjectIds(userId);
	return {
		forms: listForms(userId),
		projects: listProjects(userId)
			.filter((p) => allowed === null || allowed.has(p.id))
			.map(({ id, key, name, color }) => ({ id, key, name, color })),
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
		try {
			regenerateToken(await formId(request), locals.user!.id);
		} catch (e) {
			return failed(e);
		}
	},
	delete: async ({ request, locals }) => {
		try {
			deleteForm(await formId(request), locals.user!.id);
		} catch (e) {
			return failed(e);
		}
	}
};
