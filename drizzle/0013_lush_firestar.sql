CREATE TABLE `auth_slider_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`portal` text NOT NULL,
	`target_position` integer NOT NULL,
	`ticket_hash` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`verified_at` text,
	`consumed_at` text,
	`ip_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_slider_expiry_idx` ON `auth_slider_challenges` (`expires_at`);--> statement-breakpoint
CREATE INDEX `auth_slider_ip_idx` ON `auth_slider_challenges` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`portal` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`ip_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_codes_lookup_idx` ON `email_verification_codes` (`email`,`purpose`,`portal`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_codes_expiry_idx` ON `email_verification_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `platform_mail_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`host` text DEFAULT 'smtp.qq.com' NOT NULL,
	`port` integer DEFAULT 465 NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`password_ciphertext` text,
	`password_iv` text,
	`password_hint` text,
	`from_email` text DEFAULT '' NOT NULL,
	`from_name` text DEFAULT 'KnowFlow' NOT NULL,
	`use_ssl` integer DEFAULT true NOT NULL,
	`use_starttls` integer DEFAULT false NOT NULL,
	`relay_url` text DEFAULT '' NOT NULL,
	`relay_token_ciphertext` text,
	`relay_token_iv` text,
	`relay_token_hint` text,
	`code_expiry_minutes` integer DEFAULT 10 NOT NULL,
	`resend_seconds` integer DEFAULT 60 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`code_length` integer DEFAULT 6 NOT NULL,
	`order_notifications` integer DEFAULT true NOT NULL,
	`updated_by_admin_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
