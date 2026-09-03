CREATE TABLE customer_conversation_reads (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL
);

CREATE UNIQUE INDEX customer_conversation_reads_scope_unique
  ON customer_conversation_reads (tenant_id, conversation_id, member_id);
CREATE INDEX customer_conversation_reads_member_idx
  ON customer_conversation_reads (tenant_id, member_id, last_read_at);

CREATE TABLE customer_service_presence (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX customer_service_presence_scope_unique
  ON customer_service_presence (tenant_id, member_id);
CREATE INDEX customer_service_presence_updated_idx
  ON customer_service_presence (tenant_id, updated_at);
