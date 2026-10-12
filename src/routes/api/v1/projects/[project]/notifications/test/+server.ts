import { notificationsDtoSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { sendTestNotification } from '#lib/server/services/notifications.js';

export const POST = apiHandler((e, user) => sendTestNotification(e.params.project!, user.id), {
	responseSchema: notificationsDtoSchema
});
