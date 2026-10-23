CREATE UNIQUE INDEX `account_provider_identity_unique` ON `account` (`provider_id`, `account_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_microsoft_user_unique` ON `account` (`user_id`) WHERE `provider_id` = 'microsoft';
