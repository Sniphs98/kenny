import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { projectFormSchema } from '$lib/contracts';
import { ApiError } from '$lib/server/errors';
import { createProject, listProjects } from '$lib/server/services/projects';

export const load = async ({ locals }) => ({
	projects: listProjects(locals.user!.id),
	form: await superValidate(zod4(projectFormSchema))
});

export const actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(projectFormSchema));
		if (!form.valid) return fail(400, { form });
		let key: string;
		try {
			key = createProject(form.data, locals.user!.id).key;
		} catch (error) {
			if (error instanceof ApiError) return fail(error.status, { form: { ...form, message: error.message } });
			throw error;
		}
		redirect(303, `/projects/${key}/board`);
	}
};
