CREATE TABLE `platform_admins` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'super_admin' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_admins_email_unique` ON `platform_admins` (`email`);--> statement-breakpoint
CREATE INDEX `platform_admins_status_idx` ON `platform_admins` (`status`);--> statement-breakpoint
CREATE TABLE `platform_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`admin_email` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_audit_logs_created_idx` ON `platform_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `platform_audit_logs_admin_idx` ON `platform_audit_logs` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_payment_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'disabled' NOT NULL,
	`provider` text DEFAULT 'gateway' NOT NULL,
	`merchant_name` text DEFAULT '' NOT NULL,
	`merchant_id` text DEFAULT '' NOT NULL,
	`checkout_url` text DEFAULT '' NOT NULL,
	`refund_url` text DEFAULT '' NOT NULL,
	`callback_secret_ciphertext` text,
	`callback_secret_iv` text,
	`callback_secret_hint` text,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_by_admin_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
