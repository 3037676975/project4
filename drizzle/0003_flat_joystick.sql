CREATE TABLE `knowledge_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`knowledge_base_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_categories_name_unique` ON `knowledge_categories` (`tenant_id`,`knowledge_base_id`,`name`);--> statement-breakpoint
CREATE INDEX `knowledge_categories_scope_idx` ON `knowledge_categories` (`tenant_id`,`knowledge_base_id`,`position`);--> statement-breakpoint
DROP INDEX `knowledge_bases_tenant_idx`;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `is_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `knowledge_bases_tenant_idx` ON `knowledge_bases` (`tenant_id`,`position`);--> statement-breakpoint
DROP INDEX `knowledge_chunks_doc_index_unique`;--> statement-breakpoint
DROP INDEX `knowledge_chunks_tenant_idx`;--> statement-breakpoint
ALTER TABLE `knowledge_chunks` ADD `category_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_chunks_doc_index_unique` ON `knowledge_chunks` (`tenant_id`,`knowledge_base_id`,`document_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `knowledge_chunks_tenant_idx` ON `knowledge_chunks` (`tenant_id`,`knowledge_base_id`,`category_id`);--> statement-breakpoint
DROP INDEX `knowledge_documents_tenant_idx`;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `category_id` text;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `knowledge_documents_tenant_idx` ON `knowledge_documents` (`tenant_id`,`knowledge_base_id`,`category_id`,`position`);--> statement-breakpoint
ALTER TABLE `tenant_members` ADD `active_knowledge_base_id` text;--> statement-breakpoint
ALTER TABLE `tenant_provider_configs` ADD `credential_id_ciphertext` text;--> statement-breakpoint
ALTER TABLE `tenant_provider_configs` ADD `credential_id_iv` text;--> statement-breakpoint
ALTER TABLE `tenant_provider_configs` ADD `credential_id_hint` text;--> statement-breakpoint
ALTER TABLE `tenant_provider_configs` ADD `region` text;--> statement-breakpoint
UPDATE `knowledge_bases`
SET `is_default` = CASE WHEN `id` = (
	SELECT `kb2`.`id` FROM `knowledge_bases` AS `kb2`
	WHERE `kb2`.`tenant_id` = `knowledge_bases`.`tenant_id` AND `kb2`.`status` = 'active'
	ORDER BY `kb2`.`created_at` ASC, `kb2`.`id` ASC LIMIT 1
) THEN 1 ELSE 0 END;--> statement-breakpoint
INSERT OR IGNORE INTO `knowledge_categories`
	(`id`, `tenant_id`, `knowledge_base_id`, `name`, `position`, `is_system`, `created_at`, `updated_at`)
SELECT 'cat_default_' || `id`, `tenant_id`, `id`, '未分类', 0, 1, `created_at`, `updated_at`
FROM `knowledge_bases` WHERE `status` = 'active';--> statement-breakpoint
UPDATE `knowledge_documents`
SET `category_id` = 'cat_default_' || `knowledge_base_id`
WHERE `category_id` IS NULL AND `knowledge_base_id` IS NOT NULL;--> statement-breakpoint
UPDATE `knowledge_chunks`
SET `category_id` = 'cat_default_' || `knowledge_base_id`
WHERE `category_id` IS NULL;--> statement-breakpoint
UPDATE `tenant_members`
SET `active_knowledge_base_id` = (
	SELECT `kb`.`id` FROM `knowledge_bases` AS `kb`
	WHERE `kb`.`tenant_id` = `tenant_members`.`tenant_id` AND `kb`.`status` = 'active'
	ORDER BY `kb`.`is_default` DESC, `kb`.`position` ASC, `kb`.`created_at` ASC LIMIT 1
)
WHERE `active_knowledge_base_id` IS NULL;
