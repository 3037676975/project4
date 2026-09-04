import { PublicApiError } from "../../../../lib/api-keys";
import { completeOnce, parseMessages, prepareCompletion } from "../../../../lib/completion";
import { findFaqMatch, issueConversationToken, requireConversationToken, visitorMetadata } from "../../../../lib/customer-service";
import { flushNotificationOutbox, queueNotifications } from "../../../../lib/notifications";
import { enforceWidgetQuota, enforceWidgetRateLimit, loadPublicWidgetAssistant, publicWidgetError, verifyEmbedToken } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";
import { sha256 } from "../../../../lib/security";

type ChatPayload = { publicId?: unknown; question?: unknown; conversationId?: unknown; conversationToken?: unknown; visitorId?: unknown; embedToken?: unknown; mode?: unknown };
type ExistingConversation = { id: string; message_count: number; access_token_hash: string | null; mode: string };

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

export async function POST(request: Request) {
  try {
    let payload: ChatPayload;
    try { payload = await request.json() as ChatPayload; } catch { throw new PublicApiError(400, "请求格式不正确。"); }
    const publicId = typeof payload.publicId === "string" ? payload.publicId.trim() : "";
    const question = typeof payload.question === "string" ? payload.question.trim() : "";
    const requestedConversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
    const conversationToken = typeof payload.conversationToken === "string" ? payload.conversationToken.trim() : "";
    const visitorId = typeof payload.visitorId === "string" ? payload.visitorId.trim().slice(0, 120) : "";
    const requestedMode = payload.mode === "human" ? "human" : "ai";
    if (!question || question.length > 1200) throw new PublicApiError(400, "问题不能为空且不能超过 1200 个字符。");
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(visitorId)) throw new PublicApiError(400, "访客标识无效。");

    const assistant = await loadPublicWidgetAssistant(publicId);
    if (!assistant) throw new PublicApiError(404, "该客服入口不存在或尚未启用。");
    await verifyEmbedToken(assistant, typeof payload.embedToken === "string" ? payload.embedToken : "");
    await enforceWidgetRateLimit(request, assistant, visitorId);
    if (requestedMode === "human" && !assistant.handoffEnabled) throw new PublicApiError(403, "当前套餐未开通人工客服接管。");
    const { DB } = getRuntime(); const visitor = visitorMetadata(request);

    const existing = requestedConversationId ? await DB.prepare(`SELECT id, message_count, access_token_hash, mode FROM customer_conversations
      WHERE id = ? AND tenant_id = ? AND assistant_id = ? AND visitor_id = ? LIMIT 1`)
      .bind(requestedConversationId, assistant.tenantId, assistant.id, visitorId).first<ExistingConversation>() : null;
    if (requestedConversationId && !existing) throw new PublicApiError(404, "会话已失效，请刷新页面后重试。");
    if ((existing?.message_count || 0) >= 120) throw new PublicApiError(400, "本次会话已达到上限，请刷新页面开启新会话。");
    await enforceWidgetQuota(assistant, !existing);

    const issued = existing?.access_token_hash ? null : await issueConversationToken();
    if (existing?.access_token_hash) await requireConversationToken(conversationToken, existing.access_token_hash);
    if (existing && issued) await DB.prepare("UPDATE customer_conversations SET access_token_hash = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(issued.hash, visitor.seenAt, existing.id, assistant.tenantId).run();
    const responseToken = issued?.token || conversationToken;

    const conversationId = existing?.id || `conv_${crypto.randomUUID().replaceAll("-", "")}`;
    const visitorIdHash = await sha256(`${assistant.publicId}|${visitorId}`);
    const historyRows = existing && requestedMode === "ai" ? await DB.prepare(`SELECT role, content FROM customer_messages
      WHERE tenant_id = ? AND conversation_id = ? AND role IN ('user','assistant') AND message_type = 'text' ORDER BY created_at DESC LIMIT 10`)
      .bind(assistant.tenantId, conversationId).all<Record<string, unknown>>() : { results: [] };
    const history = (historyRows.results as Array<Record<string, unknown>>).reverse().map((row) => ({ role: row.role === "assistant" ? "assistant" as const : "user" as const, content: String(row.content) }));
    const now = visitor.seenAt;
    const statements = [DB.prepare(`INSERT INTO customer_messages
      (id, tenant_id, conversation_id, role, content, source_count, message_type, created_at) VALUES (?, ?, ?, 'user', ?, 0, 'text', ?)`)
      .bind(`msg_${crypto.randomUUID().replaceAll("-", "")}`, assistant.tenantId, conversationId, question, now)];
    if (existing) statements.push(DB.prepare(`UPDATE customer_conversations SET last_question = ?, message_count = message_count + 1,
      mode = ?, status = ?, last_message_at = ?, last_visitor_seen_at = ?,
      visitor_ip_masked = CASE WHEN visitor_ip_masked IS NULL OR visitor_ip_masked = '' THEN ? ELSE visitor_ip_masked END,
      visitor_country = CASE WHEN visitor_country IS NULL OR visitor_country = '' THEN ? ELSE visitor_country END,
      visitor_region = CASE WHEN visitor_region IS NULL OR visitor_region = '' THEN ? ELSE visitor_region END,
      visitor_city = CASE WHEN visitor_city IS NULL OR visitor_city = '' THEN ? ELSE visitor_city END,
      visitor_referer = CASE WHEN ? <> '' THEN ? ELSE visitor_referer END,
      visitor_user_agent = CASE WHEN ? <> '' THEN ? ELSE visitor_user_agent END, updated_at = ? WHERE id = ? AND tenant_id = ?`)
      .bind(question, requestedMode, requestedMode === "human" ? "handoff" : "open", now, now,
        visitor.maskedIp, visitor.country, visitor.region, visitor.city, visitor.referer, visitor.referer, visitor.userAgent, visitor.userAgent,
        now, conversationId, assistant.tenantId));
    else statements.push(DB.prepare(`INSERT INTO customer_conversations
      (id, tenant_id, assistant_id, visitor_id, visitor_id_hash, channel, access_token_hash, mode, status,
       visitor_ip_masked, visitor_country, visitor_region, visitor_city, visitor_referer, visitor_user_agent, last_visitor_seen_at,
       first_question, last_question, message_count, source_hit_count, ai_resolved, started_at, last_message_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'web_widget', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?, ?)`)
      .bind(conversationId, assistant.tenantId, assistant.id, visitorId, visitorIdHash, issued!.hash, requestedMode, requestedMode === "human" ? "handoff" : "open",
        visitor.maskedIp, visitor.country, visitor.region, visitor.city, visitor.referer, visitor.userAgent, now, question, question, now, now, now));
    await DB.batch(statements);

    if (requestedMode === "human") {
      const ticket = await DB.prepare("SELECT id FROM support_tickets WHERE tenant_id = ? AND conversation_id = ? AND status IN ('open','processing') LIMIT 1")
        .bind(assistant.tenantId, conversationId).first<{ id: string }>();
      let createdTicketId = "";
      if (!ticket) {
        createdTicketId = `ticket_${crypto.randomUUID().replaceAll("-", "")}`;
        await DB.prepare(`INSERT INTO support_tickets
          (id, tenant_id, assistant_id, conversation_id, subject, visitor_id_hash, description, contact, priority, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, '', 'normal', 'open', ?, ?)`)
          .bind(createdTicketId, assistant.tenantId, assistant.id, conversationId, question.slice(0, 80), visitorIdHash, question, now, now).run();
        await queueNotifications({
          tenantId: assistant.tenantId,
          eventType: "ticket.created",
          entityType: "ticket",
          entityId: createdTicketId,
          payload: { title: "新人工工单", description: question, conversationId, channel: "web_widget" },
        });
        await flushNotificationOutbox(assistant.tenantId, 5).catch(() => undefined);
      }
      const firstHandoff = existing?.mode !== "human";
      if (firstHandoff) {
        const handoffMessage = "已进入人工接待。消息会直接进入客服工作台，您也可以随时恢复 AI 助手。";
        const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
        await DB.batch([
          DB.prepare("INSERT INTO customer_messages (id, tenant_id, conversation_id, role, content, source_count, message_type, created_at) VALUES (?, ?, ?, 'assistant', ?, 0, 'text', ?)")
            .bind(messageId, assistant.tenantId, conversationId, handoffMessage, new Date().toISOString()),
          DB.prepare("UPDATE customer_conversations SET mode = 'human', status = 'handoff', message_count = message_count + 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
            .bind(new Date().toISOString(), conversationId, assistant.tenantId),
        ]);
        return Response.json({ conversationId, conversationToken: responseToken, messageId, answer: handoffMessage, mode: "human", resolved: false, grounded: false, faqMatched: false, qualityScore: 0, sources: [], ticketId: createdTicketId || ticket?.id || "" }, { headers: noStoreHeaders });
      }
      return Response.json({ conversationId, conversationToken: responseToken, messageId: "", answer: "", mode: "human", resolved: false, grounded: false, faqMatched: false, qualityScore: 0, sources: [], ticketId: createdTicketId || ticket?.id || "" }, { headers: noStoreHeaders });
    }

    const faq = await findFaqMatch(assistant.tenantId, assistant.id, question);
    if (faq) {
      const finishedAt = new Date().toISOString(); const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
      await DB.batch([
        DB.prepare(`INSERT INTO customer_messages (id, tenant_id, conversation_id, role, content, source_count, message_type, created_at)
          VALUES (?, ?, ?, 'assistant', ?, 1, 'text', ?)`)
          .bind(messageId, assistant.tenantId, conversationId, faq.answer, finishedAt),
        DB.prepare(`UPDATE customer_conversations SET status = 'resolved', mode = 'ai', message_count = message_count + 1,
          source_hit_count = source_hit_count + 1, ai_resolved = 1, quality_score_milli = ?, last_message_at = ?, updated_at = ?
          WHERE id = ? AND tenant_id = ?`).bind(Math.round(faq.score * 1000), finishedAt, finishedAt, conversationId, assistant.tenantId),
      ]);
      return Response.json({ conversationId, conversationToken: responseToken, messageId, answer: faq.answer, mode: "ai", resolved: true, grounded: true, faqMatched: true, qualityScore: Number(faq.score.toFixed(3)), sources: [{ document: "FAQ", excerpt: faq.question }] }, { headers: noStoreHeaders });
    }

    try {
      const messages = parseMessages([...history, { role: "user", content: question }]);
      const prepared = await prepareCompletion({ tenantId: assistant.tenantId, boundAssistantId: assistant.id, messages });
      const result = await completeOnce(prepared, 700);
      const resolved = result.grounded; const finishedAt = new Date().toISOString(); const answerMessageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
      await DB.batch([
        DB.prepare(`INSERT INTO customer_messages (id, tenant_id, conversation_id, role, content, trace_id, source_count, message_type, created_at)
          VALUES (?, ?, ?, 'assistant', ?, ?, ?, 'text', ?)`)
          .bind(answerMessageId, assistant.tenantId, conversationId, result.answer, result.traceId, prepared.sources.length, finishedAt),
        DB.prepare(`UPDATE customer_conversations SET status = ?, mode = 'ai', message_count = message_count + 1,
          source_hit_count = source_hit_count + ?, ai_resolved = ?, quality_score_milli = ?, last_message_at = ?, updated_at = ?
          WHERE id = ? AND tenant_id = ?`).bind(resolved ? "resolved" : "unresolved", prepared.sources.length, resolved ? 1 : 0, Math.round(result.qualityScore * 1000), finishedAt, finishedAt, conversationId, assistant.tenantId),
      ]);
      return Response.json({ conversationId, conversationToken: responseToken, messageId: answerMessageId, answer: result.answer, mode: "ai", resolved, grounded: result.grounded, faqMatched: false, qualityScore: Number(result.qualityScore.toFixed(3)), sources: prepared.sources.slice(0, 3).map((source) => ({ document: source.document, excerpt: source.text.slice(0, 160) })) }, { headers: noStoreHeaders });
    } catch {
      const finishedAt = new Date().toISOString();
      const answerMessageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
      const fallbackAnswer = `${assistant.brandName || "智能客服"} 的 AI 服务暂时繁忙，我已经保留这次会话。你可以继续留言，或点击“转人工”由客服接待。`;
      await DB.batch([
        DB.prepare(`INSERT INTO customer_messages (id, tenant_id, conversation_id, role, content, source_count, message_type, created_at)
          VALUES (?, ?, ?, 'assistant', ?, 0, 'text', ?)`)
          .bind(answerMessageId, assistant.tenantId, conversationId, fallbackAnswer, finishedAt),
        DB.prepare(`UPDATE customer_conversations SET status = 'unresolved', mode = 'ai', message_count = message_count + 1,
          ai_resolved = 0, quality_score_milli = 0, last_message_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
          .bind(finishedAt, finishedAt, conversationId, assistant.tenantId),
      ]).catch(() => undefined);
      return Response.json({
        conversationId,
        conversationToken: responseToken,
        messageId: answerMessageId,
        answer: fallbackAnswer,
        mode: "ai",
        resolved: false,
        grounded: false,
        faqMatched: false,
        fallback: true,
        qualityScore: 0,
        sources: [],
      }, { headers: noStoreHeaders });
    }
  } catch (error) { return publicWidgetError(error); }
}
