CREATE TABLE `channel_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`channel` text NOT NULL,
	`external_event_id` text NOT NULL,
	`assistant_id` text NOT NULL,
	`external_user_hash` text NOT NULL,
	`direction` text DEFAULT 'inbound' NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`trace_id` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_events_external_unique` ON `channel_events` (`tenant_id`,`channel`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `channel_events_tenant_idx` ON `channel_events` (`tenant_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `customer_leads` ADD `assignee_member_id` text;