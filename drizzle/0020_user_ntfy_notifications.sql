CREATE TABLE `user_ntfy_notification` (
	`user_id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`events` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
