import { localizeError } from '#lib/i18n.js';
import { requireProjectAccess, projectUsers } from '#lib/server/services/access.js';
import { error } from '@sveltejs/kit';
import { ApiError } from '#lib/server/errors.js';
import { getColumns, getProject } from '#lib/server/services/projects.js';
import { listTags } from '#lib/server/services/tags.js';
import { listDependencies, listTickets } from '#lib/server/services/tickets.js';

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
			dependencies: listDependencies(project.id, locals.user!.id),
			users: projectUsers(project.id)
		};
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
