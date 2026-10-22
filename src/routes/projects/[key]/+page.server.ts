import { withBase } from '#lib/paths.js';
import { redirect } from '@sveltejs/kit';

export const load = ({ params }) => redirect(307, withBase(`/projects/${params.key}/board`));
