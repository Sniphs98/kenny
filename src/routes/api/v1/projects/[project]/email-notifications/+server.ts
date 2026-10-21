import { emailNotificationsDtoSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { getEmailNotifications, updateEmailNotifications } from '#lib/server/services/email-notifications.js';

export const GET = apiHandler((event, user) => getEmailNotifications(event.params.project!, user.id), {
	responseSchema: emailNotificationsDtoSchema
});
export const PUT = apiHandler(
	async (event, user) => updateEmailNotifications(event.params.project!, await readJson(event), user.id),
	{ responseSchema: emailNotificationsDtoSchema }
);
