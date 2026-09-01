import { loadNativeChannelConfig, nativeAnswerResponse, nativeChallengeResponse, parseNativeInbound } from "../../../../lib/channels";
import { completeOnce, parseMessages, prepareCompletion } from "../../../../lib/completion";
import { sha256 } from "../../../../lib/security";
import { getRuntime } from "../../../../lib/runtime";

function requestScope(request: Request) {
  const url = new URL(request.url); const tenantId = url.searchParams.get("tenantId") || ""; const channel = url.searchParams.get("channel") || "";
  if (!/^(wecom|wechat|dingtalk|feishu)$/.test(channel) || !/^ten_[a-f0-9]{20,40}$/i.test(tenantId)) return null;
  return { tenantId, channel };
}

export async function GET(request: Request) {
  const scope = requestScope(request); if (!scope) return new Response("invalid channel", { status: 400 });
  const config = await loadNativeChannelConfig(scope.tenantId, scope.channel); if (!config) return new Response("channel disabled", { status: 404 });
  try { return await nativeChallengeResponse(request, config) || new Response("ok"); }
  catch (error) { return new Response(error instanceof Error ? error.message : "challenge failed", { status: 400 }); }
}

export async function POST(request: Request) {
  const scope = requestScope(request); if (!scope) return Response.json({ error: "invalid channel" }, { status: 400 });
  const config = await loadNativeChannelConfig(scope.tenantId, scope.channel); if (!config) return Response.json({ error: "channel disabled" }, { status: 404 });
  const raw = await request.text();
  try {
    const parsed = await parseNativeInbound(request, raw, config); if (parsed.response) return parsed.response; if (!parsed.event) return Response.json({ error: "invalid event" }, { status: 400 });
    const event = parsed.event; const { DB } = getRuntime();
    const duplicate = await DB.prepare("SELECT answer, trace_id, status FROM channel_events WHERE tenant_id = ? AND channel = ? AND external_event_id = ?")
      .bind(scope.tenantId, scope.channel, event.eventId).first<Record<string, unknown>>();
    if (duplicate) {
      if ((scope.channel === "wecom" || scope.channel === "wechat") && typeof duplicate.answer === "string") return nativeAnswerResponse(config, event, duplicate.answer);
      return scope.channel === "feishu" ? Response.json({ code: 0, msg: "duplicate" }) : Response.json({ msg: "duplicate" });
    }
    const prepared = await prepareCompletion({ tenantId: scope.tenantId, boundAssistantId: config.assistantId, messages: parseMessages([{ role: "user", content: event.text }]) });
    const completion = await completeOnce(prepared, 900); const now = new Date().toISOString(); const eventRowId = `chev_${crypto.randomUUID().replaceAll("-", "")}`;
    await DB.prepare(`INSERT INTO channel_events
      (id, tenant_id, channel, external_event_id, assistant_id, external_user_hash, direction, question, answer, trace_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'inbound', ?, ?, ?, 'answer_ready', ?)`)
      .bind(eventRowId, scope.tenantId, scope.channel, event.eventId, config.assistantId, await sha256(`${scope.tenantId}|${scope.channel}|${event.userId}`), event.text, completion.answer, completion.traceId, now).run();
    try {
      const response = await nativeAnswerResponse(config, event, completion.answer);
      await DB.prepare("UPDATE channel_events SET status = 'answered' WHERE id = ? AND tenant_id = ?").bind(eventRowId, scope.tenantId).run();
      return response;
    } catch (error) {
      await DB.prepare("UPDATE channel_events SET status = 'delivery_failed' WHERE id = ? AND tenant_id = ?").bind(eventRowId, scope.tenantId).run();
      return Response.json({ error: error instanceof Error ? error.message : "native delivery failed", traceId: completion.traceId }, { status: 502 });
    }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "processing failed" }, { status: 502 }); }
}
