import { PublicApiError } from "../../../../lib/api-keys";
import { enforceWidgetRateLimit, loadPublicWidgetAssistant, publicWidgetError, recordPrivacyConsent, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";
import { flushNotificationOutbox, queueNotifications } from "../../../../lib/notifications";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim().slice(0, 120) : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    const company = typeof body.company === "string" ? body.company.trim().slice(0, 100) : "";
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 120) : "";
    const need = typeof body.need === "string" ? body.need.trim().slice(0, 800) : "";
    if (!contact) throw new PublicApiError(400, "请填写手机号、微信或邮箱，方便企业联系您。");
    const assistant = await loadPublicWidgetAssistant(publicId);
    if (!assistant || !assistant.leadCaptureEnabled) throw new PublicApiError(404, "该线索入口未启用。");
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(visitorId)) throw new PublicApiError(400, "访客标识无效。");
    await verifyEmbedToken(assistant, typeof body.embedToken === "string" ? body.embedToken : "");
    const visitorHash = await recordPrivacyConsent({ request, assistant, visitorId, purpose: "lead", granted: body.consent === true });
    await enforceWidgetRateLimit(request, assistant, visitorId);
    if (!assistant.features.includes("lead_capture")) throw new PublicApiError(403, "当前套餐未开通销售线索收集。");
    const { DB } = getRuntime(); const month = new Date().toISOString().slice(0, 7);
    const used = await DB.prepare("SELECT COUNT(*) AS count FROM customer_leads WHERE tenant_id = ? AND created_at >= ?").bind(assistant.tenantId, `${month}-01T00:00:00.000Z`).first<{ count: number }>();
    if ((used?.count || 0) >= assistant.leadQuota) throw new PublicApiError(429, "本月线索额度已用完，请直接联系企业客服。");
    const validConversation = conversationId ? await DB.prepare("SELECT id FROM customer_conversations WHERE id = ? AND tenant_id = ? AND assistant_id = ?").bind(conversationId, assistant.tenantId, assistant.id).first<{ id: string }>() : null;
    const now = new Date().toISOString(); const leadId = `lead_${crypto.randomUUID().replaceAll("-", "")}`;
    const statements = [DB.prepare(`INSERT INTO customer_leads
      (id, tenant_id, assistant_id, conversation_id, visitor_id_hash, name, company, contact, need, status, estimated_value_cents, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 0, '', ?, ?)`
    ).bind(leadId, assistant.tenantId, assistant.id, validConversation?.id || null, visitorHash, name, company, contact, need, now, now)];
    if (validConversation) statements.push(DB.prepare("UPDATE customer_conversations SET lead_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(leadId, now, validConversation.id, assistant.tenantId));
    await DB.batch(statements);
    await queueNotifications({ tenantId: assistant.tenantId, eventType: "lead.created", entityType: "lead", entityId: leadId,
      payload: { title: "新销售线索", name, company, contact, need } });
    await flushNotificationOutbox(assistant.tenantId, 5).catch(() => undefined);
    return Response.json({ saved: true, leadId, message: "已提交，企业顾问会尽快联系您。" });
  } catch (error) { return publicWidgetError(error); }
}
