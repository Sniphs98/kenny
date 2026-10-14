import { localizeError } from '#lib/i18n.js';
import { requireProjectAccess, projectUsers } from '#lib/server/services/access.js';
import { error } from '@sveltejs/kit';
import { ApiError } from '#lib/server/errors.js';
import { listTags } from '#lib/server/services/tags.js';
import { listBuckets } from '#lib/server/services/buckets.js';
import { getTicketDetail, listTickets, resolveTicket } from '#lib/server/services/tickets.js';

export const load = ({ params, locals }) => {
	try {
		const role = requireProjectAccess(locals.user!.id, resolveTicket(params.key).projectId);
		const detail = getTicketDetail(params.key, locals.user!.id);
		return {
			...detail,
			canEdit: role !== 'reader',
			canManage: role === 'admin',
			projectTickets: listTickets(detail.project.id).map((t) => ({ id: t.id, key: t.key, title: t.title })),
			users: projectUsers(detail.project.id),
			tags: listTags(detail.project.id),
			buckets: listBuckets(detail.project.id)
		};
	} catch (e) {
		if (e instanceof ApiError) error(e.status, localizeError(e.message));
		throw e;
	}
};
