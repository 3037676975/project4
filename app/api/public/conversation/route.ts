import { PublicApiError } from "../../../../lib/api-keys";
import { requireConversationToken } from "../../../../lib/customer-service";
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
    const messages = await DB.prepare(`SELECT id, role, content, created_at FROM customer_messages
      WHERE tenant_id = ? AND conversation_id = ? AND role = 'agent' ORDER BY created_at ASC LIMIT 120`)
      .bind(assistant.tenantId, conversationId).all<Record<string, unknown>>();
    return Response.json({ conversationId, mode: conversation.mode, status: conversation.status, assigned: Boolean(conversation.assigned_member_id), messages: messages.results.map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at })) });
  } catch (error) { return publicWidgetError(error); }
}
