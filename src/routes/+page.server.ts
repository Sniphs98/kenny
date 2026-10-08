import { listProjects } from '$lib/server/services/projects';

export const load = () => ({ projects: listProjects() });
