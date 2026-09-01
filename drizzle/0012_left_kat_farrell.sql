CREATE TABLE `platform_provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`secondary_model` text,
	`dimensions` integer,
	`api_key_ciphertext` text,
	`api_key_iv` text,
	`api_key_hint` text,
	`reuse_api_key_from` text,
	`credential_id_ciphertext` text,
	`credential_id_iv` text,
	`credential_id_hint` text,
	`region` text,
	`candidate_count` integer,
	`top_n` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`migrated_from_tenant_id` text,
	`updated_by_admin_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_provider_kind_unique` ON `platform_provider_configs` (`kind`);