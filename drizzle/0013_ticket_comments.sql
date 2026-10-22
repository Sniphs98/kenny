CREATE TABLE `ticket_comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ticket_comment_ticket_idx` ON `ticket_comment` (`ticket_id`);
