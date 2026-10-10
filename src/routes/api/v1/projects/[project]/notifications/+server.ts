import { notificationsDtoSchema } from '$lib/contracts';
import { apiHandler, readJson } from '$lib/server/api';
import { getNotifications, updateNotifications } from '$lib/server/services/notifications';

// Nur Projektadministratoren; die Webhook-URL wird nie ausgeliefert
export const GET = apiHandler((e, user) => getNotifications(e.params.project!, user.id), {
	responseSchema: notificationsDtoSchema
});
export const PUT = apiHandler(async (e, user) => updateNotifications(e.params.project!, await readJson(e), user.id), {
	responseSchema: notificationsDtoSchema
});
