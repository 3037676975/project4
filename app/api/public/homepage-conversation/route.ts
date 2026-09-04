import { POST as publicConversationPost } from "../conversation/route";
import { createEmbedToken, loadPublicWidgetAssistant } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";

type HomepageConversationPayload = {
  conversationId?: unknown;
  conversationToken?: unknown;
  visitorId?: unknown;
  action?: unknown;
  mode?: unknown;
};

type HomepageAssistantRow = {
  id: string;
  public_id: string;
  public_enabled: number;
  tenant_id: string;
};

async function loadHomepageAssistant() {
  const { DB } = getRuntime();
  const row = await DB.prepare(`
    SELECT a.id, a.public_id, a.public_enabled, a.tenant_id
    FROM platform_admins pa
    JOIN tenant_members tm
      ON tm.status = 'active'
      AND ((pa.account_id IS NOT NULL AND tm.account_id = pa.account_id) OR tm.email = pa.email)
    JOIN tenants t ON t.id = tm.tenant_id AND t.status = 'active'
    JOIN assistants a ON a.tenant_id = tm.tenant_id AND a.status = 'active'
    WHERE pa.role = 'super_admin'
      AND pa.status = 'active'
      AND tm.role IN ('owner', 'admin')
      AND a.public_id IS NOT NULL
      AND a.public_id <> ''
    ORDER BY pa.created_at ASC,
      CASE tm.role WHEN 'owner' THEN 0 ELSE 1 END,
      CASE WHEN a.public_enabled = 1 THEN 0 ELSE 1 END,
      a.updated_at DESC
    LIMIT 1
  `).first<HomepageAssistantRow>();

  if (!row?.public_id) return null;
  if (!Boolean(row.public_enabled)) {
    await DB.prepare("UPDATE assistants SET public_enabled = 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(new Date().toISOString(), row.id, row.tenant_id).run();
  }
  return row;
}

export async function POST(request: Request) {
  let payload: HomepageConversationPayload;
  try {
    payload = await request.json() as HomepageConversationPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
  const conversationToken = typeof payload.conversationToken === "string" ? payload.conversationToken.trim() : "";
  const visitorId = typeof payload.visitorId === "string" ? payload.visitorId.trim() : "";
  if (!conversationId || !conversationToken || !visitorId) {
    return Response.json({ error: "会话参数不完整。" }, { status: 400 });
  }

  try {
    const row = await loadHomepageAssistant();
    if (!row?.public_id) return Response.json({ error: "官网客服尚未配置。" }, { status: 404 });
    const assistant = await loadPublicWidgetAssistant(row.public_id);
    if (!assistant) return Response.json({ error: "官网客服入口不可用。" }, { status: 404 });

    const embedToken = await createEmbedToken(assistant, "direct");
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");

    const forwarded = new Request(new URL("/api/public/conversation", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({
        publicId: row.public_id,
        conversationId,
        conversationToken,
        visitorId,
        embedToken,
        action: payload.action === "switch_mode" ? "switch_mode" : undefined,
        mode: payload.mode === "human" ? "human" : payload.mode === "ai" ? "ai" : undefined,
      }),
    });

    return publicConversationPost(forwarded);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "会话同步失败。" }, { status: 500 });
  }
}
