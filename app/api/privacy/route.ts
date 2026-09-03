import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";
import { cleanupTenantPrivacy } from "../../../lib/retention";

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const result = await getRuntime().DB.prepare(`SELECT id, assistant_id, request_type, verification_contact, status, notes, completed_at, created_at, updated_at
      FROM privacy_requests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100`).bind(context.tenantId).all();
    return Response.json({ requests: (result.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, assistantId: row.assistant_id, requestType: row.request_type, verificationContact: row.verification_contact, status: row.status, notes: row.notes, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at })) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); const body = await request.json() as Record<string, unknown>; const { DB } = getRuntime(); const action = String(body.action || "");
    if (action === "retention_cleanup") {
      return Response.json({ cleaned: true, ...(await cleanupTenantPrivacy(context.tenantId)) });
    }
    const id = typeof body.id === "string" ? body.id : ""; const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
    const privacy = await DB.prepare("SELECT id, request_type, visitor_id_hash, status FROM privacy_requests WHERE tenant_id = ? AND id = ?").bind(context.tenantId, id).first<{ id: string; request_type: string; visitor_id_hash: string | null; status: string }>();
    if (!privacy) return Response.json({ error: "隐私请求不存在。" }, { status: 404 });
    if (body.verified !== true) return Response.json({ error: "处理前必须由管理员线下核验请求人身份。" }, { status: 400 });
    const conversations = privacy.visitor_id_hash ? await DB.prepare("SELECT id, first_question, last_question, started_at FROM customer_conversations WHERE tenant_id = ? AND visitor_id_hash = ?").bind(context.tenantId, privacy.visitor_id_hash).all() : { results: [] };
    const [directLeads, directTickets, consents] = privacy.visitor_id_hash ? await Promise.all([
      DB.prepare("SELECT id, name, company, contact, need, status, created_at FROM customer_leads WHERE tenant_id = ? AND visitor_id_hash = ?").bind(context.tenantId, privacy.visitor_id_hash).all(),
      DB.prepare("SELECT id, subject, description, contact, status, created_at FROM support_tickets WHERE tenant_id = ? AND visitor_id_hash = ?").bind(context.tenantId, privacy.visitor_id_hash).all(),
      DB.prepare("SELECT purpose, privacy_version, granted, created_at FROM privacy_consents WHERE tenant_id = ? AND visitor_hash = ?").bind(context.tenantId, privacy.visitor_id_hash).all(),
    ]) : [{ results: [] }, { results: [] }, { results: [] }];
    const ids = (conversations.results as Array<{ id: string }>).map((row) => row.id);
    const leadMap = new Map((directLeads.results as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
    const ticketMap = new Map((directTickets.results as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
    const exportData: Record<string, unknown> = { conversations: conversations.results, messages: [], leads: [], tickets: [], consents: consents.results };
    for (const conversationId of ids) {
      const [messages, leads, tickets] = await Promise.all([DB.prepare("SELECT role, content, created_at FROM customer_messages WHERE tenant_id = ? AND conversation_id = ? ORDER BY created_at").bind(context.tenantId, conversationId).all(), DB.prepare("SELECT id, name, company, contact, need, status, created_at FROM customer_leads WHERE tenant_id = ? AND conversation_id = ?").bind(context.tenantId, conversationId).all(), DB.prepare("SELECT id, subject, description, contact, status, created_at FROM support_tickets WHERE tenant_id = ? AND conversation_id = ?").bind(context.tenantId, conversationId).all()]);
      (exportData.messages as unknown[]).push(...messages.results);
      for (const lead of leads.results as Array<Record<string, unknown>>) leadMap.set(String(lead.id), lead);
      for (const ticket of tickets.results as Array<Record<string, unknown>>) ticketMap.set(String(ticket.id), ticket);
      if (privacy.request_type === "delete") await DB.batch([DB.prepare("DELETE FROM customer_messages WHERE tenant_id = ? AND conversation_id = ?").bind(context.tenantId, conversationId), DB.prepare("UPDATE customer_leads SET name = '', company = '', contact = '[deleted]', need = '', notes = '', updated_at = ? WHERE tenant_id = ? AND conversation_id = ?").bind(new Date().toISOString(), context.tenantId, conversationId), DB.prepare("UPDATE support_tickets SET contact = '[deleted]', description = '[deleted by privacy request]', updated_at = ? WHERE tenant_id = ? AND conversation_id = ?").bind(new Date().toISOString(), context.tenantId, conversationId), DB.prepare("DELETE FROM customer_conversations WHERE tenant_id = ? AND id = ?").bind(context.tenantId, conversationId)]);
    }
    exportData.leads = [...leadMap.values()]; exportData.tickets = [...ticketMap.values()];
    const now = new Date().toISOString();
    if (privacy.request_type === "delete" && privacy.visitor_id_hash) {
      await DB.batch([
        DB.prepare("UPDATE customer_leads SET name = '', company = '', contact = '[deleted]', need = '', notes = '', visitor_id_hash = NULL, updated_at = ? WHERE tenant_id = ? AND visitor_id_hash = ?").bind(now, context.tenantId, privacy.visitor_id_hash),
        DB.prepare("UPDATE support_tickets SET contact = '[deleted]', description = '[deleted by privacy request]', visitor_id_hash = NULL, updated_at = ? WHERE tenant_id = ? AND visitor_id_hash = ?").bind(now, context.tenantId, privacy.visitor_id_hash),
        DB.prepare("DELETE FROM privacy_consents WHERE tenant_id = ? AND visitor_hash = ?").bind(context.tenantId, privacy.visitor_id_hash),
        DB.prepare("UPDATE privacy_requests SET status = 'completed', verification_contact = '[deleted]', visitor_id_hash = NULL, notes = ?, completed_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?").bind(notes, now, now, context.tenantId, id),
      ]);
    } else await DB.prepare("UPDATE privacy_requests SET status = 'completed', notes = ?, completed_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?").bind(notes, now, now, context.tenantId, id).run();
    return Response.json({ completed: true, requestType: privacy.request_type, affectedConversations: ids.length, ...(privacy.request_type === "export" ? { export: exportData } : {}) });
  } catch (error) { return routeError(error); }
}
