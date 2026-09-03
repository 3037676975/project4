import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, routeError } from "../../../../lib/tenant";

function safeSources(value: unknown) {
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function visitorJson(row: Record<string, unknown>) {
  return { id: row.id, mode: row.mode, status: row.status, firstQuestion: row.first_question, lastQuestion: row.last_question,
    visitorMaskedIp: row.visitor_ip_masked || "", visitorCountry: row.visitor_country || "", visitorRegion: row.visitor_region || "", visitorCity: row.visitor_city || "",
    visitorReferer: row.visitor_referer || "", visitorEmail: row.visitor_email || "", lastVisitorSeenAt: row.last_visitor_seen_at || null,
    offlineEmailSentAt: row.offline_email_sent_at || null, lastMessageAt: row.last_message_at };
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime(); const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 86400000).toISOString(); const since14 = new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10);
    const [conversation, faq, lead, ticket, usage, dailyRows, countryRows, traceRows, visitorRows] = await Promise.all([
      DB.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN ai_resolved = 1 THEN 1 ELSE 0 END),0) AS ai_resolved,
        COALESCE(SUM(CASE WHEN mode = 'human' THEN 1 ELSE 0 END),0) AS handoff,
        COALESCE(SUM(CASE WHEN verified_resolved = 1 OR status = 'resolved' THEN 1 ELSE 0 END),0) AS resolved
        FROM customer_conversations WHERE tenant_id = ? AND started_at >= ?`).bind(context.tenantId, since30).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(hit_count),0) AS hits FROM customer_faqs WHERE tenant_id = ? AND enabled = 1`).bind(context.tenantId).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS leads, COALESCE(SUM(CASE WHEN status IN ('qualified','won') THEN estimated_value_cents ELSE 0 END),0) AS pipeline,
        COALESCE(SUM(CASE WHEN status = 'won' THEN estimated_value_cents ELSE 0 END),0) AS won FROM customer_leads WHERE tenant_id = ? AND created_at >= ?`)
        .bind(context.tenantId, since30).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS open_tickets FROM support_tickets WHERE tenant_id = ? AND status IN ('open','processing')`).bind(context.tenantId).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(cost_micros),0) AS cost_micros, COALESCE(AVG(latency_ms),0) AS avg_latency
        FROM usage_records WHERE tenant_id = ? AND created_at >= ?`).bind(context.tenantId, since30).first<Record<string, number>>(),
      DB.prepare(`SELECT substr(started_at,1,10) AS day, COUNT(*) AS conversations,
        COALESCE(SUM(CASE WHEN ai_resolved = 1 THEN 1 ELSE 0 END),0) AS ai_resolved,
        COALESCE(SUM(CASE WHEN mode = 'human' THEN 1 ELSE 0 END),0) AS handoff
        FROM customer_conversations WHERE tenant_id = ? AND substr(started_at,1,10) >= ? GROUP BY substr(started_at,1,10) ORDER BY day`)
        .bind(context.tenantId, since14).all<Record<string, unknown>>(),
      DB.prepare(`SELECT COALESCE(NULLIF(visitor_country,''),'未知') AS country, COUNT(*) AS count FROM customer_conversations
        WHERE tenant_id = ? AND started_at >= ? GROUP BY COALESCE(NULLIF(visitor_country,''),'未知') ORDER BY count DESC LIMIT 8`).bind(context.tenantId, since30).all<Record<string, unknown>>(),
      DB.prepare(`SELECT id, request_id, model, question, answer, sources_json, total_tokens, latency_ms, cost_micros, grounded, quality_score_milli, status, created_at
        FROM traces WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 60`).bind(context.tenantId).all<Record<string, unknown>>(),
      DB.prepare(`SELECT id, mode, status, first_question, last_question, visitor_ip_masked, visitor_country, visitor_region, visitor_city,
        visitor_referer, visitor_email, last_visitor_seen_at, offline_email_sent_at, last_message_at
        FROM customer_conversations WHERE tenant_id = ? ORDER BY last_message_at DESC LIMIT 100`).bind(context.tenantId).all<Record<string, unknown>>(),
    ]);
    const total = Number(conversation?.total || 0); const aiResolved = Number(conversation?.ai_resolved || 0); const handoff = Number(conversation?.handoff || 0);
    const dailyMap = new Map((dailyRows.results as Array<Record<string, unknown>>).map((row) => [String(row.day), row]));
    const daily = Array.from({ length: 14 }, (_, index) => { const date = new Date(now.getTime() - (13 - index) * 86400000); const day = date.toISOString().slice(0, 10); const row = dailyMap.get(day) || {};
      return { day, conversations: Number(row.conversations || 0), aiResolved: Number(row.ai_resolved || 0), handoff: Number(row.handoff || 0) }; });
    const traces = (traceRows.results as Array<Record<string, unknown>>).map((row) => {
      const sources = safeSources(row.sources_json) as Array<Record<string, unknown>>; const vectorReady = sources.some((item) => Number(item.vectorScore || 0) > 0); const rerankReady = sources.some((item) => Number(item.rerankScore || 0) > 0);
      return { id: row.id, requestId: row.request_id, model: row.model, question: row.question, answer: row.answer || "", totalTokens: Number(row.total_tokens || 0), latencyMs: Number(row.latency_ms || 0), costMicros: Number(row.cost_micros || 0), grounded: Boolean(row.grounded), qualityScore: Number(row.quality_score_milli || 0) / 1000, status: row.status, createdAt: row.created_at,
        sources: sources.slice(0, 8), stages: [
          { name: "RAG 检索", status: sources.length ? "success" : row.status === "fallback" ? "no_match" : "warning", detail: sources.length ? `${sources.length} 个知识片段` : "没有可用知识片段" },
          { name: "Embedding", status: vectorReady ? "success" : sources.length ? "unknown" : "not_run", detail: vectorReady ? "向量相似度已记录" : "当前 Trace 无向量分数" },
          { name: "Rerank", status: rerankReady ? "success" : sources.length ? "not_run" : "not_run", detail: rerankReady ? "重排分数已记录" : "未记录重排分数" },
          { name: "大模型", status: row.status === "success" ? "success" : row.status === "error" ? "error" : "skipped", detail: row.status === "success" ? String(row.model) : row.status === "fallback" ? "资料不足，未调用生成模型" : "上游模型调用失败" },
        ] };
    });
    return Response.json({
      summary: { conversations: total, aiResolved, automationRate: total ? Math.round(aiResolved / total * 100) : 0, handoff, handoffRate: total ? Math.round(handoff / total * 100) : 0,
        resolved: Number(conversation?.resolved || 0), faqCount: Number(faq?.total || 0), faqHits: Number(faq?.hits || 0), modelCallsSaved: Number(faq?.hits || 0),
        leads: Number(lead?.leads || 0), pipelineCents: Number(lead?.pipeline || 0), wonCents: Number(lead?.won || 0), openTickets: Number(ticket?.open_tickets || 0),
        modelRequests: Number(usage?.requests || 0), modelCostCents: Math.round(Number(usage?.cost_micros || 0) / 10000), avgLatencyMs: Math.round(Number(usage?.avg_latency || 0)),
        costPerConversationCents: total ? Math.round(Number(usage?.cost_micros || 0) / 10000 / total) : 0 },
      daily, countries: countryRows.results.map((row) => ({ country: row.country, count: Number(row.count || 0) })), traces, visitors: visitorRows.results.map(visitorJson),
    });
  } catch (error) { return routeError(error); }
}
