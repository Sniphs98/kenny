import { redirect } from '@sveltejs/kit';

export const load = ({ params }) => redirect(307, `/projects/${params.key}/board`);
