import { PublicApiError } from "../../../../lib/api-keys";
import { requireConversationToken, visitorMetadata } from "../../../../lib/customer-service";
import { loadPublicWidgetAssistant, publicWidgetError, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";

type SyncPayload = { publicId?: unknown; conversationId?: unknown; conversationToken?: unknown; visitorId?: unknown; embedToken?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json() as SyncPayload;
    const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
    const token = typeof body.conversationToken === "string" ? body.conversationToken.trim() : "";
    if (!conversationId || !visitorId) throw new PublicApiError(400, "会话参数不完整。");
    const assistant = await loadPublicWidgetAssistant(publicId); if (!assistant) throw new PublicApiError(404, "客服入口不存在。");
    await verifyEmbedToken(assistant, typeof body.embedToken === "string" ? body.embedToken : "");
    const { DB } = getRuntime();
    const conversation = await DB.prepare(`SELECT id, access_token_hash, mode, status, assigned_member_id FROM customer_conversations
      WHERE id = ? AND tenant_id = ? AND assistant_id = ? AND visitor_id = ? LIMIT 1`)
      .bind(conversationId, assistant.tenantId, assistant.id, visitorId).first<{ id: string; access_token_hash: string | null; mode: string; status: string; assigned_member_id: string | null }>();
    if (!conversation) throw new PublicApiError(404, "会话不存在或已失效。");
    await requireConversationToken(token, conversation.access_token_hash);
    const visitor = visitorMetadata(request);
    await DB.prepare(`UPDATE customer_conversations SET last_visitor_seen_at = ?,
      visitor_ip_masked = CASE WHEN visitor_ip_masked IS NULL OR visitor_ip_masked = '' THEN ? ELSE visitor_ip_masked END,
      visitor_country = CASE WHEN visitor_country IS NULL OR visitor_country = '' THEN ? ELSE visitor_country END,
      visitor_region = CASE WHEN visitor_region IS NULL OR visitor_region = '' THEN ? ELSE visitor_region END,
      visitor_city = CASE WHEN visitor_city IS NULL OR visitor_city = '' THEN ? ELSE visitor_city END,
      visitor_referer = CASE WHEN ? <> '' THEN ? ELSE visitor_referer END,
      visitor_user_agent = CASE WHEN ? <> '' THEN ? ELSE visitor_user_agent END, updated_at = ? WHERE id = ? AND tenant_id = ?`)
      .bind(visitor.seenAt, visitor.maskedIp, visitor.country, visitor.region, visitor.city, visitor.referer, visitor.referer,
        visitor.userAgent, visitor.userAgent, visitor.seenAt, conversationId, assistant.tenantId).run();
    const messages = await DB.prepare(`SELECT id, role, content, message_type, attachment_name, attachment_mime, attachment_size, created_at FROM customer_messages
      WHERE tenant_id = ? AND conversation_id = ? AND role = 'agent' ORDER BY created_at ASC LIMIT 160`)
      .bind(assistant.tenantId, conversationId).all<Record<string, unknown>>();
    return Response.json({ conversationId, mode: conversation.mode, status: conversation.status, assigned: Boolean(conversation.assigned_member_id), messages: messages.results.map((row) => ({
      id: row.id, role: row.role, content: row.content, messageType: row.message_type || "text", attachmentName: row.attachment_name,
      attachmentMime: row.attachment_mime, attachmentSize: row.attachment_size, createdAt: row.created_at,
    })) });
  } catch (error) { return publicWidgetError(error); }
}
