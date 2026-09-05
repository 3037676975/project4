ALTER TABLE knowledge_documents ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0;

UPDATE knowledge_documents
SET storage_bytes = CASE
  WHEN COALESCE(char_count, 0) > 0 THEN char_count * 2
  ELSE 0
END
WHERE storage_bytes = 0;
