CREATE TABLE `system` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_name_unique` ON `system` (`name`);
--> statement-breakpoint
ALTER TABLE `ticket` ADD `system_id` integer REFERENCES system(id) ON DELETE set null;
