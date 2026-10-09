CREATE TABLE `intake_form` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`require_login` integer DEFAULT false NOT NULL,
	`email_mode` text DEFAULT 'optional' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intake_form_token_unique` ON `intake_form` (`token`);--> statement-breakpoint
CREATE TABLE `intake_form_project` (
	`form_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	PRIMARY KEY(`form_id`, `project_id`),
	FOREIGN KEY (`form_id`) REFERENCES `intake_form`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `intake_form_project_project_idx` ON `intake_form_project` (`project_id`);--> statement-breakpoint
ALTER TABLE `ticket` ADD `intake_form_id` integer REFERENCES intake_form(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `ticket` ADD `reporter_email` text;