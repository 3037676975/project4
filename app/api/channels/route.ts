import { CHANNEL_PROVIDERS, CustomerChannel, listChannelConfigs, loadNativeChannelConfig, saveChannelConfig, testNativeChannel } from "../../../lib/channels";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

export async function GET(request: Request) {
  try { const context = await getOrCreateTenant(request); return Response.json({ channels: await listChannelConfigs(context.tenantId, new URL(request.url).origin), providers: CHANNEL_PROVIDERS, contract: { version: "native_v1", transport: "provider-native callback", isolation: "tenant + assistant + external event id" } }); }
  catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); const body = await request.json() as Record<string, unknown>;
    const channel = String(body.channel || "") as CustomerChannel; if (!["wecom", "wechat", "dingtalk", "feishu"].includes(channel)) return Response.json({ error: "渠道无效。" }, { status: 400 });
    if (body.action === "test") {
      const config = await loadNativeChannelConfig(context.tenantId, channel, false); if (!config) return Response.json({ error: "请先保存该渠道的应用 ID 和 Secret。" }, { status: 400 });
      return Response.json(await testNativeChannel(config));
    }
    const assistantId = typeof body.assistantId === "string" ? body.assistantId : ""; const assistant = await getRuntime().DB.prepare("SELECT id FROM assistants WHERE tenant_id = ? AND id = ? AND status = 'active'").bind(context.tenantId, assistantId).first();
    if (!assistant) return Response.json({ error: "助手不存在。" }, { status: 404 });
    const saved = await saveChannelConfig({ tenantId: context.tenantId, assistantId, channel, appId: typeof body.appId === "string" ? body.appId : "", secret: typeof body.secret === "string" ? body.secret : "", verifyToken: typeof body.verifyToken === "string" ? body.verifyToken : "", encryptionKey: typeof body.encryptionKey === "string" ? body.encryptionKey : "", agentId: typeof body.agentId === "string" ? body.agentId : "", enabled: body.enabled === true });
    return Response.json({ ...saved, callbackUrl: `${new URL(request.url).origin}/api/channels/inbound?tenantId=${encodeURIComponent(context.tenantId)}&channel=${channel}` });
  } catch (error) { return routeError(error); }
}
