import { listProjects } from '$lib/server/services/projects';

/** Projekte für den Kanal-Tab; null, solange die Teams-Anmeldung noch aussteht */
export const load = ({ locals }) => ({
	projects: locals.user ? listProjects(locals.user.id).map(({ key, name, color }) => ({ key, name, color })) : null
});
