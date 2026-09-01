import { PublicApiError } from "../../../../lib/api-keys";
import { completeOnce, parseMessages, prepareCompletion } from "../../../../lib/completion";
import { enforceWidgetQuota, enforceWidgetRateLimit, loadPublicWidgetAssistant, publicWidgetError, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";
import { sha256 } from "../../../../lib/security";

type ChatPayload = { publicId?: unknown; question?: unknown; conversationId?: unknown; visitorId?: unknown; embedToken?: unknown };

export async function POST(request: Request) {
  try {
    let payload: ChatPayload;
    try { payload = await request.json() as ChatPayload; } catch { throw new PublicApiError(400, "请求格式不正确。"); }
    const publicId = typeof payload.publicId === "string" ? payload.publicId.trim() : "";
    const question = typeof payload.question === "string" ? payload.question.trim() : "";
    const requestedConversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const visitorId = typeof payload.visitorId === "string" ? payload.visitorId.trim().slice(0, 120) : "";
    if (!question || question.length > 1200) throw new PublicApiError(400, "问题不能为空且不能超过 1200 个字符。");
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(visitorId)) throw new PublicApiError(400, "访客标识无效。");

    const assistant = await loadPublicWidgetAssistant(publicId);
    if (!assistant) throw new PublicApiError(404, "该客服入口不存在或尚未启用。");
    await verifyEmbedToken(assistant, typeof payload.embedToken === "string" ? payload.embedToken : "");
    await enforceWidgetRateLimit(request, assistant, visitorId);
    const { DB } = getRuntime();

    const existing = requestedConversationId ? await DB.prepare(`
      SELECT id, message_count FROM customer_conversations
      WHERE id = ? AND tenant_id = ? AND assistant_id = ? AND visitor_id = ? LIMIT 1
    `).bind(requestedConversationId, assistant.tenantId, assistant.id, visitorId).first<{ id: string; message_count: number }>() : null;
    if (requestedConversationId && !existing) throw new PublicApiError(404, "会话已失效，请刷新页面后重试。");
    if ((existing?.message_count || 0) >= 60) throw new PublicApiError(400, "本次会话已达到上限，请刷新页面开启新会话。");
    await enforceWidgetQuota(assistant, !existing);

    const conversationId = existing?.id || `conv_${crypto.randomUUID().replaceAll("-", "")}`; const visitorIdHash = await sha256(`${assistant.publicId}|${visitorId}`);
    const historyRows = existing ? await DB.prepare(`
      SELECT role, content FROM customer_messages
      WHERE tenant_id = ? AND conversation_id = ? AND role IN ('user','assistant')
      ORDER BY created_at DESC LIMIT 10
    `).bind(assistant.tenantId, conversationId).all<Record<string, unknown>>() : { results: [] };
    const history = (historyRows.results as Array<Record<string, unknown>>).reverse().map((row) => ({ role: row.role === "assistant" ? "assistant" as const : "user" as const, content: String(row.content) }));
    const now = new Date().toISOString();
    const statements = [DB.prepare(`INSERT INTO customer_messages
      (id, tenant_id, conversation_id, role, content, source_count, created_at) VALUES (?, ?, ?, 'user', ?, 0, ?)`
      ).bind(`msg_${crypto.randomUUID().replaceAll("-", "")}`, assistant.tenantId, conversationId, question, now)];
    if (existing) statements.push(DB.prepare(`UPDATE customer_conversations SET last_question = ?, message_count = message_count + 1,
      last_message_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`).bind(question, now, now, conversationId, assistant.tenantId));
    else statements.push(DB.prepare(`INSERT INTO customer_conversations
      (id, tenant_id, assistant_id, visitor_id, visitor_id_hash, channel, status, first_question, last_question, message_count, source_hit_count, ai_resolved, started_at, last_message_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'web_widget', 'open', ?, ?, 1, 0, 0, ?, ?, ?)`
      ).bind(conversationId, assistant.tenantId, assistant.id, visitorId, visitorIdHash, question, question, now, now, now));
    await DB.batch(statements);

    const messages = parseMessages([...history, { role: "user", content: question }]);
    const prepared = await prepareCompletion({ tenantId: assistant.tenantId, boundAssistantId: assistant.id, messages });
    const result = await completeOnce(prepared, 700);
    const resolved = result.grounded;
    const finishedAt = new Date().toISOString();
    const answerMessageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    await DB.batch([
      DB.prepare(`INSERT INTO customer_messages
        (id, tenant_id, conversation_id, role, content, trace_id, source_count, created_at)
        VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`
      ).bind(answerMessageId, assistant.tenantId, conversationId, result.answer, result.traceId, prepared.sources.length, finishedAt),
      DB.prepare(`UPDATE customer_conversations SET status = ?, message_count = message_count + 1,
        source_hit_count = source_hit_count + ?, ai_resolved = ?, quality_score_milli = ?, last_message_at = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?`).bind(resolved ? "resolved" : "unresolved", prepared.sources.length, resolved ? 1 : 0, Math.round(result.qualityScore * 1000), finishedAt, finishedAt, conversationId, assistant.tenantId),
    ]);
    return Response.json({
      conversationId, messageId: answerMessageId, answer: result.answer, resolved, grounded: result.grounded, qualityScore: Number(result.qualityScore.toFixed(3)),
      sources: prepared.sources.slice(0, 3).map((source) => ({ document: source.document, excerpt: source.text.slice(0, 160) })),
    });
  } catch (error) { return publicWidgetError(error); }
}
