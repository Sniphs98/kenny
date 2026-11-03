UPDATE `user_ntfy_notification`
SET `events` = json_insert(`events`, '$[#]', 'form_ticket_commented')
WHERE NOT EXISTS (
	SELECT 1 FROM json_each(`events`) WHERE `value` = 'form_ticket_commented'
);
