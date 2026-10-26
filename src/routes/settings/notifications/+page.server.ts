import { getNtfyNotifications } from '#lib/server/services/ntfy-notifications.js';

export const load = ({ locals }) => ({ ntfy: getNtfyNotifications(locals.user!.id) });
