CREATE TABLE `billing_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_no` text NOT NULL,
	`tenant_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`subscription_id` text,
	`provider` text NOT NULL,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_trade_no` text,
	`payment_url` text,
	`client_request_id` text,
	`paid_at` text,
	`fulfilled_at` text,
	`expires_at` text NOT NULL,
	`created_by_member_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_orders_no_unique` ON `billing_orders` (`order_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_orders_client_request_unique` ON `billing_orders` (`tenant_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `billing_orders_tenant_idx` ON `billing_orders` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `channel_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assistant_id` text NOT NULL,
	`channel` text NOT NULL,
	`app_id_ciphertext` text,
	`app_id_iv` text,
	`app_id_hint` text,
	`secret_ciphertext` text,
	`secret_iv` text,
	`secret_hint` text,
	`verify_token_ciphertext` text,
	`verify_token_iv` text,
	`status` text DEFAULT 'disabled' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_configs_tenant_channel_unique` ON `channel_configs` (`tenant_id`,`channel`);--> statement-breakpoint
CREATE TABLE `cost_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`model_pattern` text NOT NULL,
	`input_micros_per_million` integer DEFAULT 0 NOT NULL,
	`output_micros_per_million` integer DEFAULT 0 NOT NULL,
	`request_micros` integer DEFAULT 0 NOT NULL,
	`ocr_micros_per_page` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_settings_tenant_model_unique` ON `cost_settings` (`tenant_id`,`model_pattern`);--> statement-breakpoint
CREATE TABLE `notification_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`channel` text NOT NULL,
	`endpoint_ciphertext` text,
	`endpoint_iv` text,
	`endpoint_hint` text,
	`secret_ciphertext` text,
	`secret_iv` text,
	`secret_hint` text,
	`events_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_configs_tenant_channel_unique` ON `notification_configs` (`tenant_id`,`channel`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`channel` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`sent_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_outbox_pending_idx` ON `notification_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notification_outbox_tenant_idx` ON `notification_outbox` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_fulfillments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`credits_granted` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_fulfillments_order_unique` ON `order_fulfillments` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_fulfillments_tenant_idx` ON `order_fulfillments` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`order_no` text NOT NULL,
	`event_type` text NOT NULL,
	`signature_valid` integer DEFAULT false NOT NULL,
	`payload_hash` text NOT NULL,
	`processing_status` text DEFAULT 'received' NOT NULL,
	`error_message` text,
	`received_at` text NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_provider_event_unique` ON `payment_events` (`provider`,`event_id`);--> statement-breakpoint
CREATE INDEX `payment_events_order_idx` ON `payment_events` (`order_no`,`received_at`);--> statement-breakpoint
CREATE TABLE `privacy_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assistant_id` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`privacy_version` text NOT NULL,
	`granted` integer NOT NULL,
	`ip_hash` text NOT NULL,
	`user_agent_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `privacy_consents_scope_idx` ON `privacy_consents` (`tenant_id`,`assistant_id`,`visitor_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `privacy_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assistant_id` text,
	`request_type` text NOT NULL,
	`verification_contact` text NOT NULL,
	`visitor_id_hash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `privacy_requests_tenant_idx` ON `privacy_requests` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quality_test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`assistant_id` text NOT NULL,
	`question` text NOT NULL,
	`expected_answer` text NOT NULL,
	`expected_document` text,
	`should_refuse` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quality_test_cases_tenant_idx` ON `quality_test_cases` (`tenant_id`,`assistant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quality_test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`trace_id` text,
	`answer` text NOT NULL,
	`grounded` integer NOT NULL,
	`quality_score_milli` integer NOT NULL,
	`passed` integer NOT NULL,
	`failure_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quality_test_runs_case_idx` ON `quality_test_runs` (`tenant_id`,`test_case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `refund_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`provider_refund_no` text,
	`requested_by_member_id` text NOT NULL,
	`reviewed_by_member_id` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refund_requests_tenant_idx` ON `refund_requests` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`created_by_member_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_invitations_token_unique` ON `tenant_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `tenant_invitations_scope_idx` ON `tenant_invitations` (`tenant_id`,`email`,`status`);--> statement-breakpoint
CREATE TABLE `ticket_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ticket_events_ticket_idx` ON `ticket_events` (`tenant_id`,`ticket_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `assistants` ADD `quality_threshold_milli` integer DEFAULT 620 NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `fallback_message` text DEFAULT '当前资料不足以可靠回答这个问题。您可以换一种说法，或点击转人工服务。' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `allowed_domains_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `privacy_notice` text DEFAULT '为便于回复您的咨询，我们仅在您同意后收集必要的联系方式和问题描述。' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `privacy_policy_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `privacy_version` text DEFAULT '2026-08-01' NOT NULL;--> statement-breakpoint
ALTER TABLE `assistants` ADD `retention_days` integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_conversations` ADD `verified_resolved` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_conversations` ADD `feedback_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_conversations` ADD `quality_score_milli` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_messages` ADD `feedback` text;--> statement-breakpoint
ALTER TABLE `customer_messages` ADD `feedback_reason` text;--> statement-breakpoint
ALTER TABLE `knowledge_chunks` ADD `vector_store` text DEFAULT 'd1' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_chunks` ADD `vector_point_id` text;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `assignee_member_id` text;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `sla_due_at` text;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `first_response_at` text;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `resolved_at` text;--> statement-breakpoint
ALTER TABLE `tenants` ADD `company_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `billing_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `privacy_retention_days` integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `onboarding_completed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `traces` ADD `cost_micros` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `traces` ADD `grounded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `traces` ADD `quality_score_milli` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_records` ADD `cost_micros` integer DEFAULT 0 NOT NULL;