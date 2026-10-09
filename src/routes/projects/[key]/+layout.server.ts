import { localizeError } from '$lib/i18n';
import { requireProjectAccess, projectUsers } from '$lib/server/services/access';
import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { getColumns, getProject } from '$lib/server/services/projects';
import { listTags } from '$lib/server/services/tags';
import { listDependencies, listTickets } from '$lib/server/services/tickets';

export const load = ({ params, locals }) => {
	try {
		const project = getProject(params.key);
		const role = requireProjectAccess(locals.user!.id, project.id);
		return {
			project,
			projectRole: role,
			canEdit: role !== 'reader',
			canManage: role === 'admin',
			columns: getColumns(project.id),
			tickets: listTickets(project.id),
			tags: listTags(project.id),
			dependencies: listDependencies(project.id),
			users: projectUsers(project.id)
		};
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
