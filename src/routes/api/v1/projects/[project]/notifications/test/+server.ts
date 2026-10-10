import { notificationsDtoSchema } from '$lib/contracts';
import { apiHandler } from '$lib/server/api';
import { sendTestNotification } from '$lib/server/services/notifications';

export const POST = apiHandler((e, user) => sendTestNotification(e.params.project!, user.id), {
	responseSchema: notificationsDtoSchema
});
