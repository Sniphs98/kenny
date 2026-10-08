import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { getColumns, getProject } from '$lib/server/services/projects';
import { listDependencies, listTickets, listUsers } from '$lib/server/services/tickets';

export const load = ({ params }) => {
	try {
		const project = getProject(params.key);
		return {
			project,
			columns: getColumns(project.id),
			tickets: listTickets(project.id),
			dependencies: listDependencies(project.id),
			users: listUsers()
		};
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
};
