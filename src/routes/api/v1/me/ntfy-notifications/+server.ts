import { ntfyNotificationsDtoSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { getNtfyNotifications, updateNtfyNotifications } from '#lib/server/services/ntfy-notifications.js';

export const GET = apiHandler((_, user) => getNtfyNotifications(user.id), { responseSchema: ntfyNotificationsDtoSchema });
export const PUT = apiHandler(async (event, user) => updateNtfyNotifications(user.id, await readJson(event)), {
	responseSchema: ntfyNotificationsDtoSchema
});
