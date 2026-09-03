import { PublicApiError } from "../../../../lib/api-keys";
import { flushNotificationOutbox, queueNotifications } from "../../../../lib/notifications";
import { loadPublicWidgetAssistant, publicWidgetError, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";
import { sha256 } from "../../../../lib/security";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const publicId = typeof body.publicId === "string" ? body.publicId : "";
    const requestType = body.requestType === "export" || body.requestType === "delete" ? body.requestType : "";
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 160) : ""; const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    if (!requestType || !contact || !visitorId) throw new PublicApiError(400, "请填写请求类型和用于核验的联系方式。");
    const assistant = await loadPublicWidgetAssistant(publicId); if (!assistant) throw new PublicApiError(404, "客服入口不存在。");
    await verifyEmbedToken(assistant, typeof body.embedToken === "string" ? body.embedToken : "");
    const id = `privacy_${crypto.randomUUID().replaceAll("-", "")}`; const now = new Date().toISOString(); const visitorHash = await sha256(`${assistant.publicId}|${visitorId}`);
    await getRuntime().DB.prepare(`INSERT INTO privacy_requests
      (id, tenant_id, assistant_id, request_type, verification_contact, visitor_id_hash, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)`)
      .bind(id, assistant.tenantId, assistant.id, requestType, contact, visitorHash, now, now).run();
    await queueNotifications({ tenantId: assistant.tenantId, eventType: "privacy.requested", entityType: "privacy_request", entityId: id, payload: { title: "客户隐私请求", requestType, contact } });
    await flushNotificationOutbox(assistant.tenantId, 5).catch(() => undefined);
    return Response.json({ saved: true, requestId: id, message: "请求已登记。企业核验身份后会处理并联系您。" }, { status: 201 });
  } catch (error) { return publicWidgetError(error); }
}
