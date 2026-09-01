import { PublicApiError } from "../../../../lib/api-keys";
import { loadPublicWidgetAssistant, publicWidgetError, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const publicId = typeof body.publicId === "string" ? body.publicId : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    const feedback = body.feedback === "positive" || body.feedback === "negative" ? body.feedback : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!feedback || !conversationId || !messageId || !visitorId) throw new PublicApiError(400, "反馈参数不完整。");
    const assistant = await loadPublicWidgetAssistant(publicId); if (!assistant) throw new PublicApiError(404, "客服入口不存在。");
    await verifyEmbedToken(assistant, typeof body.embedToken === "string" ? body.embedToken : "");
    const { DB } = getRuntime();
    const valid = await DB.prepare(`SELECT m.id FROM customer_messages m JOIN customer_conversations c ON c.id = m.conversation_id AND c.tenant_id = m.tenant_id
      WHERE m.id = ? AND m.conversation_id = ? AND m.tenant_id = ? AND m.role = 'assistant' AND c.assistant_id = ? AND c.visitor_id = ? LIMIT 1`)
      .bind(messageId, conversationId, assistant.tenantId, assistant.id, visitorId).first<{ id: string }>();
    if (!valid) throw new PublicApiError(404, "回答记录不存在。");
    const now = new Date().toISOString();
    await DB.batch([
      DB.prepare("UPDATE customer_messages SET feedback = ?, feedback_reason = ? WHERE id = ? AND tenant_id = ?").bind(feedback, reason || null, messageId, assistant.tenantId),
      DB.prepare(`UPDATE customer_conversations SET feedback_status = ?, verified_resolved = ?, status = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?`).bind(feedback, feedback === "positive" ? 1 : 0, feedback === "positive" ? "resolved" : "unresolved", now, conversationId, assistant.tenantId),
    ]);
    return Response.json({ saved: true, feedback });
  } catch (error) { return publicWidgetError(error); }
}
