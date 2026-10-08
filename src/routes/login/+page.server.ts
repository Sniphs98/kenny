import { redirect } from '@sveltejs/kit';
import { microsoftEnabled } from '$lib/server/auth';

export const load = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { microsoftEnabled };
};
