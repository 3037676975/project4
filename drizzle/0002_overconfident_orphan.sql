ALTER TABLE `tenant_provider_configs` ADD `reuse_api_key_from` text;--> statement-breakpoint
ALTER TABLE `tenant_provider_configs` ADD `candidate_count` integer;--> statement-breakpoint
ALTER TABLE `tenant_provider_configs` ADD `top_n` integer;