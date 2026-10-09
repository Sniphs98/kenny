import { localizeError } from '$lib/i18n';
import { requireProjectAccess, projectUsers } from '$lib/server/services/access';
import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { listTags } from '$lib/server/services/tags';
import { getTicketDetail, listTickets, resolveTicket } from '$lib/server/services/tickets';

export const load = ({ params, locals }) => {
	try {
		const role = requireProjectAccess(locals.user!.id, resolveTicket(params.key).projectId);
		const detail = getTicketDetail(params.key, locals.user!.id);
		return {
			...detail,
			canEdit: role !== 'reader',
			projectTickets: listTickets(detail.project.id).map((t) => ({ id: t.id, key: t.key, title: t.title })),
			users: projectUsers(detail.project.id),
			tags: listTags(detail.project.id)
		};
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
