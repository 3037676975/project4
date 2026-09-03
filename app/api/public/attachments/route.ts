import { PublicApiError } from "../../../../lib/api-keys";
import { attachmentResponse, storeCustomerAttachment } from "../../../../lib/customer-attachments";
import { requireConversationToken, visitorMetadata } from "../../../../lib/customer-service";
import { enforceWidgetRateLimit, loadPublicWidgetAssistant, publicWidgetError, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";

async function authorize(input: { publicId: string; conversationId: string; conversationToken: string; visitorId: string; embedToken: string }) {
  const assistant = await loadPublicWidgetAssistant(input.publicId); if (!assistant) throw new PublicApiError(404, "客服入口不存在。");
  await verifyEmbedToken(assistant, input.embedToken); const { DB } = getRuntime();
  const conversation = await DB.prepare(`SELECT id, access_token_hash, mode FROM customer_conversations
    WHERE id = ? AND tenant_id = ? AND assistant_id = ? AND visitor_id = ? LIMIT 1`).bind(input.conversationId, assistant.tenantId, assistant.id, input.visitorId)
    .first<{ id: string; access_token_hash: string | null; mode: string }>();
  if (!conversation) throw new PublicApiError(404, "会话不存在。"); await requireConversationToken(input.conversationToken, conversation.access_token_hash);
  return { assistant, conversation };
}

export async function POST(request: Request) {
  try {
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const body = await request.json() as Record<string, unknown>; const messageId = String(body.messageId || "").trim();
      const auth = await authorize({ publicId: String(body.publicId || ""), conversationId: String(body.conversationId || ""), conversationToken: String(body.conversationToken || ""), visitorId: String(body.visitorId || ""), embedToken: String(body.embedToken || "") });
      const message = await getRuntime().DB.prepare(`SELECT attachment_key, attachment_name, attachment_mime, message_type FROM customer_messages
        WHERE id = ? AND tenant_id = ? AND conversation_id = ? AND attachment_key IS NOT NULL LIMIT 1`).bind(messageId, auth.assistant.tenantId, auth.conversation.id)
        .first<{ attachment_key: string; attachment_name: string; attachment_mime: string; message_type: string }>();
      if (!message) throw new PublicApiError(404, "附件不存在。");
      return attachmentResponse(message.attachment_key, message.attachment_mime, message.attachment_name, message.message_type === "image");
    }
    const form = await request.formData(); const publicId = String(form.get("publicId") || ""); const conversationId = String(form.get("conversationId") || "");
    const conversationToken = String(form.get("conversationToken") || ""); const visitorId = String(form.get("visitorId") || ""); const embedToken = String(form.get("embedToken") || "");
    const file = form.get("file"); if (!(file instanceof File)) throw new PublicApiError(400, "请选择文件。");
    const auth = await authorize({ publicId, conversationId, conversationToken, visitorId, embedToken });
    if (auth.conversation.mode !== "human") throw new PublicApiError(400, "请先切换到人工客服，再发送图片或文件。");
    await enforceWidgetRateLimit(request, auth.assistant, visitorId);
    const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`; const stored = await storeCustomerAttachment({ tenantId: auth.assistant.tenantId, conversationId, messageId, file });
    const now = new Date().toISOString(); const visitor = visitorMetadata(request); const content = stored.messageType === "image" ? `[图片] ${stored.name}` : `[文件] ${stored.name}`;
    try {
      await getRuntime().DB.batch([
        getRuntime().DB.prepare(`INSERT INTO customer_messages
          (id, tenant_id, conversation_id, role, content, source_count, message_type, attachment_name, attachment_mime, attachment_size, attachment_key, created_at)
          VALUES (?, ?, ?, 'user', ?, 0, ?, ?, ?, ?, ?, ?)`)
          .bind(messageId, auth.assistant.tenantId, conversationId, content, stored.messageType, stored.name, stored.mime, stored.size, stored.key, now),
        getRuntime().DB.prepare(`UPDATE customer_conversations SET mode = 'human', status = 'handoff', message_count = message_count + 1,
          last_message_at = ?, last_visitor_seen_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
          .bind(now, visitor.seenAt, now, conversationId, auth.assistant.tenantId),
      ]);
    } catch (error) { await getRuntime().BUCKET.delete(stored.key).catch(() => undefined); throw error; }
    return Response.json({ saved: true, message: { id: messageId, role: "user", content, messageType: stored.messageType, attachmentName: stored.name, attachmentMime: stored.mime, attachmentSize: stored.size, createdAt: now } });
  } catch (error) { return publicWidgetError(error); }
}
