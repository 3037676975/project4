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

type ConversationAssistantRow = {
  id: string;
  public_id: string;
  public_enabled: number;
  tenant_id: string;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

async function loadConversationAssistant(conversationId: string, visitorId: string) {
  const { DB } = getRuntime();
  const row = await DB.prepare(`
    SELECT a.id, a.public_id, a.public_enabled, a.tenant_id
    FROM customer_conversations c
    JOIN assistants a ON a.id = c.assistant_id AND a.tenant_id = c.tenant_id AND a.status = 'active'
    JOIN tenants t ON t.id = c.tenant_id AND t.status = 'active'
    WHERE c.id = ?
      AND c.visitor_id = ?
      AND c.channel = 'web_widget'
      AND a.public_id IS NOT NULL
      AND a.public_id <> ''
    LIMIT 1
  `).bind(conversationId, visitorId).first<ConversationAssistantRow>();
  return row?.public_id ? row : null;
}

export async function POST(request: Request) {
  let payload: HomepageConversationPayload;
  try {
    payload = await request.json() as HomepageConversationPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400, headers: noStoreHeaders });
  }

  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
  const conversationToken = typeof payload.conversationToken === "string" ? payload.conversationToken.trim() : "";
  const visitorId = typeof payload.visitorId === "string" ? payload.visitorId.trim() : "";
  if (!conversationId || !conversationToken || !visitorId) {
    return Response.json({ error: "会话参数不完整。" }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const row = await loadConversationAssistant(conversationId, visitorId);
    if (!row?.public_id) return Response.json({ error: "会话不存在或已失效。" }, { status: 404, headers: noStoreHeaders });

    // Sync must stay bound to the assistant that originally created this
    // conversation. Selecting the newest homepage assistant here can point
    // polling at another assistant and make human replies disappear.
    if (!Boolean(row.public_enabled)) {
      await getRuntime().DB.prepare("UPDATE assistants SET public_enabled = 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .bind(new Date().toISOString(), row.id, row.tenant_id).run();
    }
    const assistant = await loadPublicWidgetAssistant(row.public_id);
    if (!assistant) return Response.json({ error: "会话对应的客服入口不可用。" }, { status: 404, headers: noStoreHeaders });

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

    const response = await publicConversationPost(forwarded);
    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(noStoreHeaders)) responseHeaders.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "会话同步失败。" }, { status: 500, headers: noStoreHeaders });
  }
}
