import { localizeError } from '#lib/i18n.js';
import { publicTicketStatusSchema } from '#lib/contracts/index.js';
import { ApiError } from '#lib/server/errors.js';
import { getPublicTicketStatus } from '#lib/server/services/public-ticket-status.js';

export const GET = ({ params }) => {
	try {
		return Response.json(publicTicketStatusSchema.parse(getPublicTicketStatus(params.key, params.access)), {
			headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }
		});
	} catch (reason) {
		if (reason instanceof ApiError)
			return Response.json({ error: localizeError(reason.message) }, { status: reason.status });
		throw reason;
	}
};
