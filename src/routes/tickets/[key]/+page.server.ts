import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { listTags } from '$lib/server/services/tags';
import { getTicketDetail, listTickets, listUsers } from '$lib/server/services/tickets';

export const load = ({ params }) => {
	try {
		const detail = getTicketDetail(params.key);
		return {
			...detail,
			projectTickets: listTickets(detail.project.id).map((t) => ({ id: t.id, key: t.key, title: t.title })),
			users: listUsers(),
			tags: listTags(detail.project.id)
		};
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
};
