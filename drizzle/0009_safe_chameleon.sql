ALTER TABLE `api_token` ADD `read_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `api_token` ADD `expires_at` integer;