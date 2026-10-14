CREATE TABLE `bucket` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bucket_project_name_idx` ON `bucket` (`project_id`,`name`);--> statement-breakpoint
ALTER TABLE `ticket` ADD `bucket_id` integer REFERENCES bucket(id) ON DELETE set null;
