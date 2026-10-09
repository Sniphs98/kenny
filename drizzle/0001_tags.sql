CREATE TABLE `tag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_project_name_idx` ON `tag` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `ticket_tag` (
	`ticket_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`ticket_id`, `tag_id`),
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_tag_tag_idx` ON `ticket_tag` (`tag_id`);--> statement-breakpoint
-- Standard-Tags für bestehende Projekte
INSERT INTO `tag` (`project_id`, `name`, `color`) SELECT `id`, 'Bug', '#ef4444' FROM `project`;--> statement-breakpoint
INSERT INTO `tag` (`project_id`, `name`, `color`) SELECT `id`, 'Feature', '#3b82f6' FROM `project`;--> statement-breakpoint
INSERT INTO `tag` (`project_id`, `name`, `color`) SELECT `id`, 'Story', '#22c55e' FROM `project`;
