import { sendOfflineConversationReply } from "../../../../lib/offline-followup";
import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";

function conversationJson(row: Record<string, unknown>) {
  return { id: row.id, status: row.status, mode: row.mode, firstQuestion: row.first_question, lastQuestion: row.last_question,
    messageCount: Number(row.message_count || 0), assignedMemberId: row.assigned_member_id || null, startedAt: row.started_at, lastMessageAt: row.last_message_at,
    visitorMaskedIp: row.visitor_ip_masked || "", visitorCountry: row.visitor_country || "", visitorRegion: row.visitor_region || "", visitorCity: row.visitor_city || "",
    visitorReferer: row.visitor_referer || "", visitorUserAgent: row.visitor_user_agent || "", visitorEmail: row.visitor_email || "",
    lastVisitorSeenAt: row.last_visitor_seen_at || null, offlineEmailSentAt: row.offline_email_sent_at || null };
}
function messageJson(row: Record<string, unknown>) {
  return { id: row.id, role: row.role, content: row.content, traceId: row.trace_id || null, messageType: row.message_type || "text",
    attachmentName: row.attachment_name || null, attachmentMime: row.attachment_mime || null, attachmentSize: row.attachment_size || null, createdAt: row.created_at };
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime(); const id = new URL(request.url).searchParams.get("id")?.trim();
    const fields = `id, status, mode, first_question, last_question, message_count, assigned_member_id, started_at, last_message_at,
      visitor_ip_masked, visitor_country, visitor_region, visitor_city, visitor_referer, visitor_user_agent, visitor_email, last_visitor_seen_at, offline_email_sent_at`;
    if (id) {
      const conversation = await DB.prepare(`SELECT ${fields} FROM customer_conversations WHERE id = ? AND tenant_id = ? LIMIT 1`).bind(id, context.tenantId).first<Record<string, unknown>>();
      if (!conversation) return Response.json({ error: "会话不存在。" }, { status: 404 });
      const messages = await DB.prepare(`SELECT id, role, content, trace_id, message_type, attachment_name, attachment_mime, attachment_size, created_at
        FROM customer_messages WHERE tenant_id = ? AND conversation_id = ? ORDER BY created_at ASC LIMIT 240`).bind(context.tenantId, id).all<Record<string, unknown>>();
      return Response.json({ conversation: conversationJson(conversation), messages: messages.results.map(messageJson) });
    }
    const rows = await DB.prepare(`SELECT ${fields} FROM customer_conversations WHERE tenant_id = ?
      ORDER BY CASE WHEN mode = 'human' AND status = 'handoff' THEN 0 ELSE 1 END, last_message_at DESC LIMIT 100`).bind(context.tenantId).all<Record<string, unknown>>();
    return Response.json({ conversations: rows.results.map(conversationJson) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner","admin","member"]); const body = await request.json() as Record<string, unknown>;
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : ""; const action = String(body.action || "reply");
    if (!conversationId) return Response.json({ error: "缺少会话 ID。" }, { status: 400 }); const { DB } = getRuntime();
    const conversation = await DB.prepare("SELECT id FROM customer_conversations WHERE id = ? AND tenant_id = ? LIMIT 1").bind(conversationId, context.tenantId).first();
    if (!conversation) return Response.json({ error: "会话不存在。" }, { status: 404 }); const now = new Date().toISOString();
    if (action === "resolve") {
      await DB.batch([
        DB.prepare("UPDATE customer_conversations SET status = 'resolved', mode = 'human', assigned_member_id = COALESCE(assigned_member_id, ?), updated_at = ? WHERE id = ? AND tenant_id = ?").bind(context.memberId, now, conversationId, context.tenantId),
        DB.prepare("UPDATE support_tickets SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE tenant_id = ? AND conversation_id = ? AND status IN ('open','processing')").bind(now, now, context.tenantId, conversationId),
      ]); return Response.json({ saved: true });
    }
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 3000) : ""; if (!message) return Response.json({ error: "回复内容不能为空。" }, { status: 400 });
    const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    await DB.batch([
      DB.prepare("INSERT INTO customer_messages (id, tenant_id, conversation_id, role, content, source_count, message_type, created_at) VALUES (?, ?, ?, 'agent', ?, 0, 'text', ?)").bind(messageId, context.tenantId, conversationId, message, now),
      DB.prepare("UPDATE customer_conversations SET status = 'handoff', mode = 'human', assigned_member_id = COALESCE(assigned_member_id, ?), message_count = message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(context.memberId, now, now, conversationId, context.tenantId),
      DB.prepare("UPDATE support_tickets SET status = 'processing', assignee_member_id = COALESCE(assignee_member_id, ?), first_response_at = COALESCE(first_response_at, ?), updated_at = ? WHERE tenant_id = ? AND conversation_id = ? AND status IN ('open','processing')").bind(context.memberId, now, now, context.tenantId, conversationId),
    ]);
    const offlineEmail = await sendOfflineConversationReply({ tenantId: context.tenantId, conversationId, preview: message });
    return Response.json({ saved: true, messageId, offlineEmail });
  } catch (error) { return routeError(error); }
}
