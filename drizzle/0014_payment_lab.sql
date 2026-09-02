CREATE TABLE `payment_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`order_no` text,
	`status` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_logs_order_idx` ON `payment_logs` (`order_no`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_logs_provider_idx` ON `payment_logs` (`provider`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_logs_created_idx` ON `payment_logs` (`created_at`);
