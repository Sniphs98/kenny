CREATE TABLE `intake_form_tag` (
	`form_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`form_id`, `tag_id`),
	FOREIGN KEY (`form_id`) REFERENCES `intake_form`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `intake_form_tag_tag_idx` ON `intake_form_tag` (`tag_id`);--> statement-breakpoint
ALTER TABLE `intake_form` ADD `fields` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `intake_form` ADD `restrict_tags` integer DEFAULT false NOT NULL;