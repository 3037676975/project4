import { sendMail } from "./mail";
import { getRuntime } from "./runtime";
import { isEmailAddress } from "./customer-service";

export async function sendOfflineConversationReply(input: { tenantId: string; conversationId: string; preview: string }) {
  const runtime = getRuntime();
  const row = await runtime.DB.prepare(`SELECT c.visitor_email, c.last_visitor_seen_at, c.offline_email_sent_at,
      a.public_id, a.brand_name, a.name
    FROM customer_conversations c JOIN assistants a ON a.id = c.assistant_id AND a.tenant_id = c.tenant_id
    WHERE c.id = ? AND c.tenant_id = ? LIMIT 1`).bind(input.conversationId, input.tenantId).first<{
      visitor_email: string | null; last_visitor_seen_at: string | null; offline_email_sent_at: string | null;
      public_id: string; brand_name: string | null; name: string;
    }>();
  const email = String(row?.visitor_email || "").trim().toLowerCase();
  if (!row || !isEmailAddress(email)) return { sent: false, reason: "no_email" as const };
  const seen = row.last_visitor_seen_at ? Date.parse(row.last_visitor_seen_at) : 0;
  if (seen && Date.now() - seen < 90_000) return { sent: false, reason: "visitor_online" as const };
  const lastSent = row.offline_email_sent_at ? Date.parse(row.offline_email_sent_at) : 0;
  if (lastSent && Date.now() - lastSent < 5 * 60_000) return { sent: false, reason: "throttled" as const };
  const brand = String(row.brand_name || row.name || "企业客服").slice(0, 80);
  const base = String(runtime.APP_BASE_URL || "").replace(/\/$/, ""); const link = base ? `${base}/chat/${row.public_id}` : "";
  const preview = input.preview.trim().slice(0, 600) || "人工客服已回复您的咨询。";
  try {
    await sendMail({ to: email, subject: `【${brand}】人工客服有新的回复`,
      text: `${preview}\n\n${link ? `返回客服：${link}\n\n` : ""}为保护会话隐私，请优先回到原网页客服窗口查看完整上下文。`,
      html: `<p>${escapeHtml(preview)}</p>${link ? `<p><a href="${escapeHtml(link)}">返回网页客服</a></p>` : ""}<p style="color:#64748b">为保护会话隐私，请优先回到原网页客服窗口查看完整上下文。</p>` });
    const now = new Date().toISOString();
    await runtime.DB.prepare("UPDATE customer_conversations SET offline_email_sent_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(now, now, input.conversationId, input.tenantId).run();
    return { sent: true, reason: "sent" as const };
  } catch {
    return { sent: false, reason: "mail_unavailable" as const };
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] || c);
}
