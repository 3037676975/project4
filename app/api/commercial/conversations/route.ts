import { sendOfflineConversationReply } from "../../../../lib/offline-followup";
import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";

function conversationJson(row: Record<string, unknown>) {
  return {
    id: row.id, status: row.status, mode: row.mode, firstQuestion: row.first_question, lastQuestion: row.last_question,
    messageCount: Number(row.message_count || 0), assignedMemberId: row.assigned_member_id || null, assignedMemberName: row.assigned_member_name || "",
    startedAt: row.started_at, lastMessageAt: row.last_message_at,
    visitorMaskedIp: row.visitor_ip_masked || "", visitorCountry: row.visitor_country || "", visitorRegion: row.visitor_region || "", visitorCity: row.visitor_city || "",
    visitorReferer: row.visitor_referer || "", visitorUserAgent: row.visitor_user_agent || "", visitorEmail: row.visitor_email || "",
    lastVisitorSeenAt: row.last_visitor_seen_at || null, offlineEmailSentAt: row.offline_email_sent_at || null,
    unreadCount: Number(row.unread_count || 0), waiting: Boolean(row.waiting), waitingSince: row.waiting_since || null,
    slaDueAt: row.sla_due_at || null, firstResponseAt: row.first_response_at || null, ticketPriority: row.ticket_priority || "", ticketStatus: row.ticket_status || "",
    leadName: row.lead_name || "", leadCompany: row.lead_company || "", leadNeed: row.lead_need || "", leadStatus: row.lead_status || "", leadValueCents: Number(row.lead_value_cents || 0),
  };
}
function messageJson(row: Record<string, unknown>) {
  return { id: row.id, role: row.role, content: row.content, traceId: row.trace_id || null, messageType: row.message_type || "text",
    attachmentName: row.attachment_name || null, attachmentMime: row.attachment_mime || null, attachmentSize: row.attachment_size || null, createdAt: row.created_at };
}
function presenceStatus(status: unknown, updatedAt: unknown) {
  const updated = typeof updatedAt === "string" ? Date.parse(updatedAt) : 0;
  if (!updated || Date.now() - updated > 90_000) return "offline";
  return ["online", "busy", "away"].includes(String(status)) ? String(status) : "offline";
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime(); const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim(); const summaryOnly = url.searchParams.get("summary") === "1"; const memberId = context.memberId || "";
    const fields = `c.id, c.status, c.mode, c.first_question, c.last_question, c.message_count, c.assigned_member_id, c.started_at, c.last_message_at,
      c.visitor_ip_masked, c.visitor_country, c.visitor_region, c.visitor_city, c.visitor_referer, c.visitor_user_agent, c.visitor_email, c.last_visitor_seen_at, c.offline_email_sent_at,
      COALESCE(am.display_name, am.email, '') AS assigned_member_name,
      t.created_at AS waiting_since, t.sla_due_at, t.first_response_at, t.priority AS ticket_priority, t.status AS ticket_status,
      CASE WHEN c.mode = 'human' AND c.status = 'handoff' AND t.id IS NOT NULL AND t.first_response_at IS NULL AND t.status IN ('open','processing') THEN 1 ELSE 0 END AS waiting,
      COALESCE(l.name, '') AS lead_name, COALESCE(l.company, '') AS lead_company, COALESCE(l.need, '') AS lead_need, COALESCE(l.status, '') AS lead_status, COALESCE(l.estimated_value_cents, 0) AS lead_value_cents,
      (SELECT COUNT(*) FROM customer_messages um WHERE um.tenant_id = c.tenant_id AND um.conversation_id = c.id AND um.role = 'user' AND um.created_at > COALESCE(cr.last_read_at, '')) AS unread_count`;
    const joins = `LEFT JOIN tenant_members am ON am.id = c.assigned_member_id AND am.tenant_id = c.tenant_id
      LEFT JOIN customer_leads l ON l.id = c.lead_id AND l.tenant_id = c.tenant_id
      LEFT JOIN customer_conversation_reads cr ON cr.tenant_id = c.tenant_id AND cr.conversation_id = c.id AND cr.member_id = ?
      LEFT JOIN support_tickets t ON t.id = (SELECT t2.id FROM support_tickets t2 WHERE t2.tenant_id = c.tenant_id AND t2.conversation_id = c.id ORDER BY CASE WHEN t2.status IN ('open','processing') THEN 0 ELSE 1 END, t2.created_at DESC LIMIT 1)`;

    if (id) {
      const conversation = await DB.prepare(`SELECT ${fields} FROM customer_conversations c ${joins} WHERE c.id = ? AND c.tenant_id = ? LIMIT 1`)
        .bind(memberId, id, context.tenantId).first<Record<string, unknown>>();
      if (!conversation) return Response.json({ error: "会话不存在。" }, { status: 404 });
      const messages = await DB.prepare(`SELECT id, role, content, trace_id, message_type, attachment_name, attachment_mime, attachment_size, created_at
        FROM customer_messages WHERE tenant_id = ? AND conversation_id = ? ORDER BY created_at ASC LIMIT 300`).bind(context.tenantId, id).all<Record<string, unknown>>();
      return Response.json({ conversation: conversationJson(conversation), messages: messages.results.map(messageJson) });
    }

    const [rows, agentRows] = await Promise.all([
      DB.prepare(`SELECT ${fields} FROM customer_conversations c ${joins} WHERE c.tenant_id = ?
        ORDER BY CASE WHEN c.mode = 'human' AND c.status = 'handoff' AND t.first_response_at IS NULL THEN 0 ELSE 1 END,
          CASE WHEN (SELECT COUNT(*) FROM customer_messages um2 WHERE um2.tenant_id = c.tenant_id AND um2.conversation_id = c.id AND um2.role = 'user' AND um2.created_at > COALESCE(cr.last_read_at, '')) > 0 THEN 0 ELSE 1 END,
          c.last_message_at DESC LIMIT 150`).bind(memberId, context.tenantId).all<Record<string, unknown>>(),
      DB.prepare(`SELECT tm.id, COALESCE(tm.display_name, tm.email) AS display_name, tm.email, tm.role,
          p.status AS presence_status, p.updated_at AS presence_updated_at
        FROM tenant_members tm LEFT JOIN customer_service_presence p ON p.tenant_id = tm.tenant_id AND p.member_id = tm.id
        WHERE tm.tenant_id = ? AND tm.status = 'active' ORDER BY tm.role, display_name`).bind(context.tenantId).all<Record<string, unknown>>(),
    ]);
    const conversations = rows.results.map(conversationJson);
    const agents = agentRows.results.map((row) => ({ memberId: String(row.id), displayName: String(row.display_name || row.email || "客服"), email: String(row.email || ""), role: String(row.role || "member"), status: presenceStatus(row.presence_status, row.presence_updated_at), updatedAt: row.presence_updated_at || null }));
    const summary = {
      total: conversations.length,
      waiting: conversations.filter((item) => item.waiting).length,
      unread: conversations.reduce((sum, item) => sum + item.unreadCount, 0),
      mine: memberId ? conversations.filter((item) => item.assignedMemberId === memberId && item.status !== "resolved").length : 0,
      onlineAgents: agents.filter((item) => item.status !== "offline").length,
    };
    if (summaryOnly) return Response.json({ summary });
    return Response.json({ conversations, currentMemberId: memberId, agents, summary });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin", "member"]);
    const body = await request.json() as Record<string, unknown>; const action = String(body.action || "reply"); const { DB } = getRuntime(); const now = new Date().toISOString();

    if (action === "presence") {
      if (!context.memberId) return Response.json({ error: "当前账号没有企业成员身份。" }, { status: 403 });
      const status = ["online", "busy", "away", "offline"].includes(String(body.status)) ? String(body.status) : "online";
      await DB.prepare(`INSERT INTO customer_service_presence (id, tenant_id, member_id, status, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, member_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
        .bind(`csp_${crypto.randomUUID().replaceAll("-", "")}`, context.tenantId, context.memberId, status, now).run();
      return Response.json({ saved: true, status });
    }

    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    if (!conversationId) return Response.json({ error: "缺少会话 ID。" }, { status: 400 });
    const conversation = await DB.prepare("SELECT id FROM customer_conversations WHERE id = ? AND tenant_id = ? LIMIT 1").bind(conversationId, context.tenantId).first();
    if (!conversation) return Response.json({ error: "会话不存在。" }, { status: 404 });

    if (action === "read") {
      if (!context.memberId) return Response.json({ saved: true });
      await DB.prepare(`INSERT INTO customer_conversation_reads (id, tenant_id, conversation_id, member_id, last_read_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, conversation_id, member_id) DO UPDATE SET last_read_at = excluded.last_read_at`)
        .bind(`csr_${crypto.randomUUID().replaceAll("-", "")}`, context.tenantId, conversationId, context.memberId, now).run();
      return Response.json({ saved: true });
    }

    if (action === "assign") {
      const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
      if (memberId) {
        const member = await DB.prepare("SELECT id FROM tenant_members WHERE id = ? AND tenant_id = ? AND status = 'active' LIMIT 1").bind(memberId, context.tenantId).first();
        if (!member) return Response.json({ error: "目标客服不存在或已停用。" }, { status: 400 });
      }
      await DB.batch([
        DB.prepare("UPDATE customer_conversations SET assigned_member_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(memberId || null, now, conversationId, context.tenantId),
        DB.prepare("UPDATE support_tickets SET assignee_member_id = ?, updated_at = ? WHERE tenant_id = ? AND conversation_id = ? AND status IN ('open','processing')").bind(memberId || null, now, context.tenantId, conversationId),
      ]);
      return Response.json({ saved: true });
    }

    if (action === "resolve") {
      await DB.batch([
        DB.prepare("UPDATE customer_conversations SET status = 'resolved', mode = 'human', assigned_member_id = COALESCE(assigned_member_id, ?), verified_resolved = 1, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(context.memberId, now, conversationId, context.tenantId),
        DB.prepare("UPDATE support_tickets SET status = 'resolved', resolved_at = COALESCE(resolved_at, ?), updated_at = ? WHERE tenant_id = ? AND conversation_id = ? AND status IN ('open','processing')").bind(now, now, context.tenantId, conversationId),
      ]);
      return Response.json({ saved: true });
    }

    if (action === "reopen") {
      await DB.batch([
        DB.prepare("UPDATE customer_conversations SET status = 'handoff', mode = 'human', verified_resolved = 0, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, conversationId, context.tenantId),
        DB.prepare("UPDATE support_tickets SET status = 'processing', resolved_at = NULL, updated_at = ? WHERE tenant_id = ? AND conversation_id = ? AND status = 'resolved'").bind(now, context.tenantId, conversationId),
      ]);
      return Response.json({ saved: true });
    }

    const message = typeof body.message === "string" ? body.message.trim().slice(0, 3000) : "";
    if (!message) return Response.json({ error: "回复内容不能为空。" }, { status: 400 });
    const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    await DB.batch([
      DB.prepare("INSERT INTO customer_messages (id, tenant_id, conversation_id, role, content, source_count, message_type, created_at) VALUES (?, ?, ?, 'agent', ?, 0, 'text', ?)").bind(messageId, context.tenantId, conversationId, message, now),
      DB.prepare("UPDATE customer_conversations SET status = 'handoff', mode = 'human', assigned_member_id = COALESCE(assigned_member_id, ?), message_count = message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(context.memberId, now, now, conversationId, context.tenantId),
      DB.prepare("UPDATE support_tickets SET status = 'processing', assignee_member_id = COALESCE(assignee_member_id, ?), first_response_at = COALESCE(first_response_at, ?), updated_at = ? WHERE tenant_id = ? AND conversation_id = ? AND status IN ('open','processing')").bind(context.memberId, now, now, context.tenantId, conversationId),
    ]);
    if (context.memberId) {
      await DB.prepare(`INSERT INTO customer_conversation_reads (id, tenant_id, conversation_id, member_id, last_read_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, conversation_id, member_id) DO UPDATE SET last_read_at = excluded.last_read_at`)
        .bind(`csr_${crypto.randomUUID().replaceAll("-", "")}`, context.tenantId, conversationId, context.memberId, now).run();
    }
    const offlineEmail = await sendOfflineConversationReply({ tenantId: context.tenantId, conversationId, preview: message });
    return Response.json({ saved: true, messageId, offlineEmail });
  } catch (error) { return routeError(error); }
}
