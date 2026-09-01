CREATE TABLE `api_rate_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`window_minute` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_rate_bucket_unique` ON `api_rate_buckets` (`api_key_id`,`window_minute`);--> statement-breakpoint
CREATE TABLE `assistants` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`knowledge_base_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`model_alias` text NOT NULL,
	`system_prompt` text NOT NULL,
	`temperature_milli` integer DEFAULT 200 NOT NULL,
	`top_k` integer DEFAULT 5 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistants_tenant_alias_unique` ON `assistants` (`tenant_id`,`model_alias`);--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`reference_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credit_ledger_tenant_idx` ON `credit_ledger` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customer_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`assistant_id` text,
	`scopes_json` text NOT NULL,
	`rpm_limit` integer DEFAULT 60 NOT NULL,
	`tpm_limit` integer DEFAULT 100000 NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`last_used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_api_keys_hash_unique` ON `customer_api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `customer_api_keys_tenant_idx` ON `customer_api_keys` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`feature` text NOT NULL,
	`limit_value` integer,
	`used_value` integer DEFAULT 0 NOT NULL,
	`reset_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_tenant_feature_unique` ON `entitlements` (`tenant_id`,`feature`);--> statement-breakpoint
CREATE TABLE `knowledge_bases` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_bases_tenant_idx` ON `knowledge_bases` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`knowledge_base_id` text NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`token_estimate` integer NOT NULL,
	`embedding_json` text,
	`embedding_model` text,
	`vector_dim` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_chunks_doc_index_unique` ON `knowledge_chunks` (`document_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `knowledge_chunks_tenant_idx` ON `knowledge_chunks` (`tenant_id`,`knowledge_base_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`monthly_price_cents` integer DEFAULT 0 NOT NULL,
	`request_quota` integer NOT NULL,
	`token_quota` integer NOT NULL,
	`storage_quota_bytes` integer NOT NULL,
	`monthly_credits` integer NOT NULL,
	`api_key_limit` integer NOT NULL,
	`member_limit` integer NOT NULL,
	`features_json` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_code_unique` ON `plans` (`code`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`starts_at` text NOT NULL,
	`expires_at` text,
	`auto_renew` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_tenant_idx` ON `subscriptions` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_members_tenant_email_unique` ON `tenant_members` (`tenant_id`,`email`);--> statement-breakpoint
CREATE INDEX `tenant_members_email_idx` ON `tenant_members` (`email`);--> statement-breakpoint
CREATE TABLE `tenant_provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`secondary_model` text,
	`dimensions` integer,
	`api_key_ciphertext` text,
	`api_key_iv` text,
	`api_key_hint` text,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_provider_kind_unique` ON `tenant_provider_configs` (`tenant_id`,`kind`);--> statement-breakpoint
CREATE TABLE `tenant_usage_monthly` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`month` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`credits_used` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_usage_month_unique` ON `tenant_usage_monthly` (`tenant_id`,`month`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`credits_balance` integer DEFAULT 10000 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`api_key_id` text,
	`assistant_id` text NOT NULL,
	`model` text NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `traces_tenant_idx` ON `traces` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `traces_request_unique` ON `traces` (`request_id`);--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `tenant_id` text;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `knowledge_base_id` text;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `index_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `chunk_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `ocr_used` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `knowledge_documents_tenant_idx` ON `knowledge_documents` (`tenant_id`,`knowledge_base_id`);--> statement-breakpoint
ALTER TABLE `usage_records` ADD `tenant_id` text;--> statement-breakpoint
ALTER TABLE `usage_records` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `usage_records` ADD `credits` integer DEFAULT 0 NOT NULL;