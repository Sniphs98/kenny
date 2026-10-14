CREATE TABLE `ticket_assignee` (
	`ticket_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`ticket_id`, `user_id`),
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_assignee_user_idx` ON `ticket_assignee` (`user_id`);--> statement-breakpoint
-- Bisherige Zuständige übernehmen
INSERT INTO `ticket_assignee` (`ticket_id`, `user_id`, `position`) SELECT `id`, `assignee_id`, 0 FROM `ticket` WHERE `assignee_id` IS NOT NULL;
