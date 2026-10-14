import { redirect } from '@sveltejs/kit';
import { microsoftEnabled } from '#lib/server/auth.js';
import { registrationAllowed } from '#lib/server/services/users.js';

export const load = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { microsoftEnabled, registrationAllowed: registrationAllowed() };
};
