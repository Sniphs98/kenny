CREATE TABLE `ticket_subscriber` (
	`ticket_id` integer NOT NULL REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	PRIMARY KEY(`ticket_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `ticket_subscriber_user_idx` ON `ticket_subscriber` (`user_id`);
