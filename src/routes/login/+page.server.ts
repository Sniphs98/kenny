import { withBase } from '#lib/paths.js';
import { redirect } from '@sveltejs/kit';
import { microsoftEnabled } from '#lib/server/auth.js';
import { registrationAllowed } from '#lib/server/services/users.js';

export const load = ({ locals }) => {
	if (locals.user) redirect(303, withBase('/'));
	return { microsoftEnabled, registrationAllowed: registrationAllowed() };
};
