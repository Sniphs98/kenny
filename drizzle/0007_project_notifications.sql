CREATE TABLE `project_notification` (
	`project_id` integer PRIMARY KEY NOT NULL,
	`webhook_url` text NOT NULL,
	`events` text NOT NULL,
	`locale` text DEFAULT 'de' NOT NULL,
	`last_sent_at` integer,
	`last_error` text,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
