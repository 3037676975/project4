import { PublicApiError } from "../../../../lib/api-keys";
import { isEmailAddress, requireConversationToken } from "../../../../lib/customer-service";
import { enforceWidgetRateLimit, loadPublicWidgetAssistant, publicWidgetError, recordPrivacyConsent, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";
import { flushNotificationOutbox, queueNotifications } from "../../../../lib/notifications";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const conversationToken = typeof body.conversationToken === "string" ? body.conversationToken.trim() : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim().slice(0, 120) : "";
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 120) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1200) : "";
    if (!description) throw new PublicApiError(400, "请简单描述需要人工处理的问题。");

    const assistant = await loadPublicWidgetAssistant(publicId);
    if (!assistant || !assistant.handoffEnabled) throw new PublicApiError(404, "该人工服务入口未启用。");
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(visitorId)) throw new PublicApiError(400, "访客标识无效。");
    await verifyEmbedToken(assistant, typeof body.embedToken === "string" ? body.embedToken : "");
    const visitorHash = await recordPrivacyConsent({ request, assistant, visitorId, purpose: "ticket", granted: body.consent === true });
    await enforceWidgetRateLimit(request, assistant, visitorId);
    if (!assistant.features.includes("handoff")) throw new PublicApiError(403, "当前套餐未开通转人工工单。");

    const { DB } = getRuntime();
    const validConversation = conversationId ? await DB.prepare(`SELECT id, access_token_hash FROM customer_conversations
      WHERE id = ? AND tenant_id = ? AND assistant_id = ? AND visitor_id = ? LIMIT 1`)
      .bind(conversationId, assistant.tenantId, assistant.id, visitorId)
      .first<{ id: string; access_token_hash: string | null }>() : null;
    if (conversationId && !validConversation) throw new PublicApiError(404, "会话不存在。");
    if (validConversation) await requireConversationToken(conversationToken, validConversation.access_token_hash);

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const ticketId = `ticket_${crypto.randomUUID().replaceAll("-", "")}`;
    const slaDueAt = new Date(nowDate.getTime() + 4 * 3600000).toISOString();
    const statements = [
      DB.prepare(`INSERT INTO support_tickets
        (id, tenant_id, assistant_id, conversation_id, visitor_id_hash, subject, description, contact, priority, status, sla_due_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '网页客服转人工', ?, ?, 'normal', 'open', ?, ?, ?)`)
        .bind(ticketId, assistant.tenantId, assistant.id, validConversation?.id || null, visitorHash, description, contact, slaDueAt, now, now),
      DB.prepare(`INSERT INTO ticket_events (id, tenant_id, ticket_id, actor_type, event_type, detail_json, created_at)
        VALUES (?, ?, ?, 'visitor', 'created', ?, ?)`)
        .bind(`te_${crypto.randomUUID().replaceAll("-", "")}`, assistant.tenantId, ticketId, JSON.stringify({ channel: "web_widget", slaDueAt }), now),
    ];

    if (validConversation) {
      const email = isEmailAddress(contact) ? contact.toLowerCase() : "";
      statements.push(DB.prepare(`UPDATE customer_conversations SET status = 'handoff', mode = 'human',
        visitor_email = CASE WHEN ? <> '' THEN ? ELSE visitor_email END, last_visitor_seen_at = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?`)
        .bind(email, email, now, now, validConversation.id, assistant.tenantId));
    }
    await DB.batch(statements);

    await queueNotifications({ tenantId: assistant.tenantId, eventType: "ticket.created", entityType: "ticket", entityId: ticketId,
      payload: { title: "新人工工单", description, contact, slaDueAt } });
    await flushNotificationOutbox(assistant.tenantId, 5).catch(() => undefined);
    return Response.json({ saved: true, ticketId, message: `人工工单 ${ticketId.slice(-8)} 已创建。` });
  } catch (error) {
    return publicWidgetError(error);
  }
}
