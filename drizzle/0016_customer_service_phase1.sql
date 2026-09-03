ALTER TABLE customer_conversations ADD COLUMN access_token_hash TEXT;
ALTER TABLE customer_conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE customer_conversations ADD COLUMN assigned_member_id TEXT;

CREATE TABLE customer_faqs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX customer_faqs_tenant_idx ON customer_faqs (tenant_id, assistant_id, enabled, priority);
CREATE INDEX customer_faqs_updated_idx ON customer_faqs (tenant_id, updated_at);
