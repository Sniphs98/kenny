import { emailNotificationsDtoSchema } from '#lib/contracts/index.js';
import { apiHandler } from '#lib/server/api.js';
import { sendTestEmailNotification } from '#lib/server/services/email-notifications.js';

export const POST = apiHandler((event, user) => sendTestEmailNotification(event.params.project!, user.id), {
	responseSchema: emailNotificationsDtoSchema
});
