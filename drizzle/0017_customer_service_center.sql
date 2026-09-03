ALTER TABLE customer_conversations ADD COLUMN visitor_ip_masked TEXT;
ALTER TABLE customer_conversations ADD COLUMN visitor_country TEXT;
ALTER TABLE customer_conversations ADD COLUMN visitor_region TEXT;
ALTER TABLE customer_conversations ADD COLUMN visitor_city TEXT;
ALTER TABLE customer_conversations ADD COLUMN visitor_referer TEXT;
ALTER TABLE customer_conversations ADD COLUMN visitor_user_agent TEXT;
ALTER TABLE customer_conversations ADD COLUMN visitor_email TEXT;
ALTER TABLE customer_conversations ADD COLUMN last_visitor_seen_at TEXT;
ALTER TABLE customer_conversations ADD COLUMN offline_email_sent_at TEXT;

ALTER TABLE customer_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE customer_messages ADD COLUMN attachment_name TEXT;
ALTER TABLE customer_messages ADD COLUMN attachment_mime TEXT;
ALTER TABLE customer_messages ADD COLUMN attachment_size INTEGER;
ALTER TABLE customer_messages ADD COLUMN attachment_key TEXT;

CREATE INDEX customer_conversations_visitor_seen_idx ON customer_conversations (tenant_id, last_visitor_seen_at);
CREATE INDEX customer_messages_attachment_idx ON customer_messages (tenant_id, conversation_id, message_type);
