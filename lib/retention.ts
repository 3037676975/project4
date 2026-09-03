import { getRuntime } from "./runtime";

export async function cleanupTenantPrivacy(tenantId: string) {
  const { DB } = getRuntime(); const assistants = await DB.prepare("SELECT id, retention_days FROM assistants WHERE tenant_id = ?").bind(tenantId).all();
  let conversationsDeleted = 0; const now = new Date().toISOString();
  for (const assistant of assistants.results as Array<{ id: string; retention_days: number }>) {
    const cutoff = new Date(Date.now() - Math.max(30, assistant.retention_days) * 86400000).toISOString();
    const conversations = await DB.prepare("SELECT id FROM customer_conversations WHERE tenant_id = ? AND assistant_id = ? AND last_message_at < ?").bind(tenantId, assistant.id, cutoff).all();
    for (const row of conversations.results as Array<{ id: string }>) {
      await DB.batch([
        DB.prepare("DELETE FROM customer_messages WHERE tenant_id = ? AND conversation_id = ?").bind(tenantId, row.id),
        DB.prepare("DELETE FROM customer_conversations WHERE tenant_id = ? AND id = ?").bind(tenantId, row.id),
      ]);
      conversationsDeleted += 1;
    }
    await DB.batch([
      DB.prepare("UPDATE customer_leads SET name = '', company = '', contact = '[expired]', need = '', notes = '', visitor_id_hash = NULL, updated_at = ? WHERE tenant_id = ? AND assistant_id = ? AND created_at < ?").bind(now, tenantId, assistant.id, cutoff),
      DB.prepare("UPDATE support_tickets SET contact = '[expired]', description = '[expired by retention policy]', visitor_id_hash = NULL, updated_at = ? WHERE tenant_id = ? AND assistant_id = ? AND created_at < ?").bind(now, tenantId, assistant.id, cutoff),
      DB.prepare("DELETE FROM privacy_consents WHERE tenant_id = ? AND assistant_id = ? AND created_at < ?").bind(tenantId, assistant.id, cutoff),
      DB.prepare("DELETE FROM traces WHERE tenant_id = ? AND assistant_id = ? AND created_at < ?").bind(tenantId, assistant.id, cutoff),
      DB.prepare("DELETE FROM channel_events WHERE tenant_id = ? AND assistant_id = ? AND created_at < ?").bind(tenantId, assistant.id, cutoff),
      DB.prepare("UPDATE privacy_requests SET verification_contact = '[expired]', visitor_id_hash = NULL, notes = '', updated_at = ? WHERE tenant_id = ? AND assistant_id = ? AND status = 'completed' AND completed_at < ?").bind(now, tenantId, assistant.id, cutoff),
    ]);
  }
  const rateCutoff = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 16);
  const outboxCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await DB.batch([
    DB.prepare("DELETE FROM widget_rate_buckets WHERE window_minute < ?").bind(rateCutoff),
    DB.prepare("DELETE FROM notification_outbox WHERE tenant_id = ? AND status IN ('sent','failed') AND created_at < ?").bind(tenantId, outboxCutoff),
  ]);
  return { conversationsDeleted };
}
