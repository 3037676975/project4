CREATE TABLE `customer_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assistant_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`channel` text DEFAULT 'web_widget' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`first_question` text DEFAULT '' NOT NULL,
	`last_question` text DEFAULT '' NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`source_hit_count` integer DEFAULT 0 NOT NULL,
	`ai_resolved` integer DEFAULT false NOT NULL,
	`lead_id` text,
	`started_at` text NOT NULL,
	`last_message_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_conversations_tenant_idx` ON `customer_conversations` (`tenant_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `customer_conversations_assistant_idx` ON `customer_conversations` (`assistant_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `customer_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assistant_id` text NOT NULL,
	`conversation_id` text,
	`name` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`contact` text NOT NULL,
	`need` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`estimated_value_cents` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_leads_tenant_idx` ON `customer_leads` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customer_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`trace_id` text,
	`source_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_messages_conversation_idx` ON `customer_messages` (`tenant_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assistant_id` text NOT NULL,
	`conversation_id` text,
	`lead_id` text,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_tickets_tenant_idx` ON `support_tickets` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `widget_rate_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`assistant_id` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`window_minute` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `widget_rate_bucket_unique` ON `widget_rate_buckets` (`assistant_id`,`visitor_hash`,`window_minute`);--> statement-breakpoint
ALTER TABLE `assistants` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `assistants` ADD `public_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `brand_name` text DEFAULT '智能客服' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `welcome_message` text DEFAULT '您好，我是企业智能客服。您可以咨询产品、使用方法和售后政策。' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `theme_color` text DEFAULT '#6d4aff' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `lead_capture_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `handoff_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `handoff_label` text DEFAULT '转人工服务' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `industry_template` text DEFAULT 'manufacturing_after_sales' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `suggested_questions_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `assistants_public_id_unique` ON `assistants` (`public_id`);--> statement-breakpoint
ALTER TABLE `plans` ADD `widget_conversation_quota` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `lead_quota` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
UPDATE `assistants` SET `public_id` = 'pub_' || lower(hex(randomblob(16))) WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `plans` SET `widget_conversation_quota` = 50, `lead_quota` = 10, `features_json` = '["rag","openai_api","web_widget"]' WHERE `code` = 'free';--> statement-breakpoint
UPDATE `plans` SET `widget_conversation_quota` = 3000, `lead_quota` = 300, `features_json` = '["rag","openai_api","sse","ocr","rerank","web_widget","lead_capture","handoff","commercial_dashboard"]' WHERE `code` = 'growth';--> statement-breakpoint
UPDATE `plans` SET `widget_conversation_quota` = 20000, `lead_quota` = 3000, `features_json` = '["rag","openai_api","sse","ocr","rerank","audit","priority","web_widget","lead_capture","handoff","commercial_dashboard"]' WHERE `code` = 'business';
