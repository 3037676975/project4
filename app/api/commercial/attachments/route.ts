import { storeCustomerAttachment, attachmentResponse } from "../../../../lib/customer-attachments";
import { sendOfflineConversationReply } from "../../../../lib/offline-followup";
import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner","admin","member"]); const { DB } = getRuntime();
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const body = await request.json() as Record<string, unknown>; const messageId = String(body.messageId || "").trim();
      const row = await DB.prepare(`SELECT attachment_key, attachment_name, attachment_mime, message_type FROM customer_messages
        WHERE id = ? AND tenant_id = ? AND attachment_key IS NOT NULL LIMIT 1`).bind(messageId, context.tenantId)
        .first<{ attachment_key: string; attachment_name: string; attachment_mime: string; message_type: string }>();
      if (!row) return Response.json({ error: "附件不存在。" }, { status: 404 });
      return attachmentResponse(row.attachment_key, row.attachment_mime, row.attachment_name, row.message_type === "image");
    }
    const form = await request.formData(); const conversationId = String(form.get("conversationId") || "").trim(); const file = form.get("file");
    if (!conversationId || !(file instanceof File)) return Response.json({ error: "请选择会话和文件。" }, { status: 400 });
    const conversation = await DB.prepare("SELECT id FROM customer_conversations WHERE id = ? AND tenant_id = ? LIMIT 1").bind(conversationId, context.tenantId).first();
    if (!conversation) return Response.json({ error: "会话不存在。" }, { status: 404 });
    const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`; const stored = await storeCustomerAttachment({ tenantId: context.tenantId, conversationId, messageId, file });
    const now = new Date().toISOString(); const content = stored.messageType === "image" ? `[图片] ${stored.name}` : `[文件] ${stored.name}`;
    try {
      await DB.batch([
        DB.prepare(`INSERT INTO customer_messages
          (id, tenant_id, conversation_id, role, content, source_count, message_type, attachment_name, attachment_mime, attachment_size, attachment_key, created_at)
          VALUES (?, ?, ?, 'agent', ?, 0, ?, ?, ?, ?, ?, ?)`)
          .bind(messageId, context.tenantId, conversationId, content, stored.messageType, stored.name, stored.mime, stored.size, stored.key, now),
        DB.prepare(`UPDATE customer_conversations SET mode = 'human', status = 'handoff', assigned_member_id = COALESCE(assigned_member_id, ?),
          message_count = message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
          .bind(context.memberId, now, now, conversationId, context.tenantId),
      ]);
    } catch (error) { await getRuntime().BUCKET.delete(stored.key).catch(() => undefined); throw error; }
    const offlineEmail = await sendOfflineConversationReply({ tenantId: context.tenantId, conversationId, preview: `人工客服向您发送了${stored.messageType === "image" ? "一张图片" : "一个文件"}：${stored.name}` });
    return Response.json({ saved: true, offlineEmail, message: { id: messageId, role: "agent", content, messageType: stored.messageType, attachmentName: stored.name, attachmentMime: stored.mime, attachmentSize: stored.size, createdAt: now } });
  } catch (error) { return routeError(error); }
}
