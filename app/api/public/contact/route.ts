import { PublicApiError } from "../../../../lib/api-keys";
import { isEmailAddress, requireConversationToken } from "../../../../lib/customer-service";
import { loadPublicWidgetAssistant, publicWidgetError, recordPrivacyConsent, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const conversationToken = typeof body.conversationToken === "string" ? body.conversationToken.trim() : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";
    if (!conversationId || !visitorId || !isEmailAddress(email)) throw new PublicApiError(400, "请填写有效邮箱，并先开始一次客服会话。");
    const assistant = await loadPublicWidgetAssistant(publicId); if (!assistant) throw new PublicApiError(404, "客服入口不存在。");
    await verifyEmbedToken(assistant, typeof body.embedToken === "string" ? body.embedToken : "");
    const row = await getRuntime().DB.prepare(`SELECT access_token_hash FROM customer_conversations
      WHERE id = ? AND tenant_id = ? AND assistant_id = ? AND visitor_id = ? LIMIT 1`)
      .bind(conversationId, assistant.tenantId, assistant.id, visitorId).first<{ access_token_hash: string | null }>();
    if (!row) throw new PublicApiError(404, "会话不存在。");
    await requireConversationToken(conversationToken, row.access_token_hash);
    await recordPrivacyConsent({ request, assistant, visitorId, purpose: "offline_followup", granted: body.consent === true });
    const now = new Date().toISOString();
    await getRuntime().DB.prepare("UPDATE customer_conversations SET visitor_email = ?, last_visitor_seen_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(email, now, now, conversationId, assistant.tenantId).run();
    return Response.json({ saved: true, message: "已保存邮箱。您离开网页后，人工客服的新回复可通过邮件提醒您。" });
  } catch (error) { return publicWidgetError(error); }
}
