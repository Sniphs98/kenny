ALTER TABLE `project` ADD `systems` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ticket` ADD `system_name` text;
