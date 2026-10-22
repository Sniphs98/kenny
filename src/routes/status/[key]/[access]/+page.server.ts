import { error, fail } from '@sveltejs/kit';
import { localizeError } from '#lib/i18n.js';
import { ApiError } from '#lib/server/errors.js';
import { addPublicTicketComment, getPublicTicketStatus } from '#lib/server/services/public-ticket-status.js';

function status(key: string, access: string) {
	try {
		return getPublicTicketStatus(key, access);
	} catch (reason) {
		if (reason instanceof ApiError) error(reason.status, localizeError(reason.message));
		throw reason;
	}
}

export const load = ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	return { ticket: status(params.key, params.access) };
};

export const actions = {
	default: async ({ request, params, getClientAddress }) => {
		const data = await request.formData();
		const body = String(data.get('body') ?? '');
		try {
			return {
				success: true,
				ticket: addPublicTicketComment(
					params.key,
					params.access,
					{ body },
					getClientAddress()
				)
			};
		} catch (reason) {
			if (reason instanceof ApiError)
				return fail(reason.status, { success: false, message: localizeError(reason.message), body });
			throw reason;
		}
	}
};
