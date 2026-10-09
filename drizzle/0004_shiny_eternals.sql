CREATE TABLE `project_member` (
	`project_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_member_user_idx` ON `project_member` (`user_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Bootstrap the oldest existing account. New installations bootstrap on first registration.
UPDATE user SET role = 'admin' WHERE id = (SELECT id FROM user ORDER BY created_at, id LIMIT 1);
--> statement-breakpoint
-- Preserve access previously shared by all registered users.
INSERT INTO project_member (project_id, user_id, role)
SELECT p.id, u.id,
  CASE WHEN u.id = p.owner_id OR (p.owner_id IS NULL AND u.role = 'admin') THEN 'admin' ELSE 'member' END
FROM project p CROSS JOIN user u;
