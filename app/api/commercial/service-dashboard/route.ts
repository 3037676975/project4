import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, routeError } from "../../../../lib/tenant";

function safeSources(value: unknown) {
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function visitorJson(row: Record<string, unknown>) {
  return { id: row.id, mode: row.mode, status: row.status, firstQuestion: row.first_question, lastQuestion: row.last_question,
    visitorMaskedIp: row.visitor_ip_masked || "", visitorCountry: row.visitor_country || "", visitorRegion: row.visitor_region || "", visitorCity: row.visitor_city || "",
    visitorReferer: row.visitor_referer || "", visitorEmail: row.visitor_email || "", lastVisitorSeenAt: row.last_visitor_seen_at || null,
    offlineEmailSentAt: row.offline_email_sent_at || null, lastMessageAt: row.last_message_at,
    leadName: row.lead_name || "", leadCompany: row.lead_company || "", leadStatus: row.lead_status || "" };
}
function sourceScore(item: Record<string, unknown>, key: "vector" | "rerank" | "confidence") {
  if (key === "vector") return Number(item.vectorScore || item.vector_score || 0);
  if (key === "rerank") return Number(item.rerankScore || item.rerank_score || item.score || 0);
  return Number(item.confidenceScore || item.confidence_score || 0);
}
function average(values: number[]) { return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0; }
function buildTrend(now: Date, days: number, rows: Array<Record<string, unknown>>) {
  const byDay = new Map(rows.map((row) => [String(row.day), row]));
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() - (days - 1 - index) * 86400000); const day = date.toISOString().slice(0, 10); const row = byDay.get(day) || {};
    return { day, label: day.slice(5), conversations: Number(row.conversations || 0), aiResolved: Number(row.ai_resolved || 0), handoff: Number(row.handoff || 0), resolved: Number(row.resolved || 0) };
  });
  if (days <= 30) return daily;
  const buckets: Array<{ day: string; label: string; conversations: number; aiResolved: number; handoff: number; resolved: number }> = [];
  for (let index = 0; index < daily.length; index += 7) {
    const group = daily.slice(index, index + 7); const first = group[0]; const last = group[group.length - 1];
    buckets.push({ day: first.day, label: `${first.day.slice(5)}–${last.day.slice(5)}`, conversations: group.reduce((sum, item) => sum + item.conversations, 0), aiResolved: group.reduce((sum, item) => sum + item.aiResolved, 0), handoff: group.reduce((sum, item) => sum + item.handoff, 0), resolved: group.reduce((sum, item) => sum + item.resolved, 0) });
  }
  return buckets;
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime(); const now = new Date(); const url = new URL(request.url);
    const requestedDays = Number(url.searchParams.get("days") || 30); const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const since = new Date(now.getTime() - days * 86400000).toISOString(); const sinceDay = since.slice(0, 10); const memberId = context.memberId || "";
    const presenceFreshAfter = new Date(now.getTime() - 90_000).toISOString();

    const [conversation, faq, lead, ticket, usage, dailyRows, countryRows, traceRows, visitorRows, ticketMetrics, agentRows, inboxRows, onlineRow] = await Promise.all([
      DB.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN ai_resolved = 1 THEN 1 ELSE 0 END),0) AS ai_resolved,
        COALESCE(SUM(CASE WHEN mode = 'human' THEN 1 ELSE 0 END),0) AS handoff,
        COALESCE(SUM(CASE WHEN verified_resolved = 1 OR status = 'resolved' THEN 1 ELSE 0 END),0) AS resolved,
        COALESCE(SUM(CASE WHEN verified_resolved = 1 THEN 1 ELSE 0 END),0) AS verified_resolved
        FROM customer_conversations WHERE tenant_id = ? AND started_at >= ?`).bind(context.tenantId, since).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(hit_count),0) AS hits FROM customer_faqs WHERE tenant_id = ? AND enabled = 1`).bind(context.tenantId).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS leads, COALESCE(SUM(CASE WHEN status IN ('qualified','won') THEN estimated_value_cents ELSE 0 END),0) AS pipeline,
        COALESCE(SUM(CASE WHEN status = 'won' THEN estimated_value_cents ELSE 0 END),0) AS won FROM customer_leads WHERE tenant_id = ? AND created_at >= ?`)
        .bind(context.tenantId, since).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS open_tickets FROM support_tickets WHERE tenant_id = ? AND status IN ('open','processing')`).bind(context.tenantId).first<Record<string, number>>(),
      DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(cost_micros),0) AS cost_micros, COALESCE(AVG(latency_ms),0) AS avg_latency
        FROM usage_records WHERE tenant_id = ? AND created_at >= ?`).bind(context.tenantId, since).first<Record<string, number>>(),
      DB.prepare(`SELECT substr(started_at,1,10) AS day, COUNT(*) AS conversations,
        COALESCE(SUM(CASE WHEN ai_resolved = 1 THEN 1 ELSE 0 END),0) AS ai_resolved,
        COALESCE(SUM(CASE WHEN mode = 'human' THEN 1 ELSE 0 END),0) AS handoff,
        COALESCE(SUM(CASE WHEN verified_resolved = 1 OR status = 'resolved' THEN 1 ELSE 0 END),0) AS resolved
        FROM customer_conversations WHERE tenant_id = ? AND substr(started_at,1,10) >= ? GROUP BY substr(started_at,1,10) ORDER BY day`)
        .bind(context.tenantId, sinceDay).all<Record<string, unknown>>(),
      DB.prepare(`SELECT COALESCE(NULLIF(visitor_country,''),'未知') AS country, COUNT(*) AS count FROM customer_conversations
        WHERE tenant_id = ? AND started_at >= ? GROUP BY COALESCE(NULLIF(visitor_country,''),'未知') ORDER BY count DESC LIMIT 10`).bind(context.tenantId, since).all<Record<string, unknown>>(),
      DB.prepare(`SELECT id, request_id, model, question, answer, sources_json, total_tokens, latency_ms, cost_micros, grounded, quality_score_milli, status, created_at
        FROM traces WHERE tenant_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 120`).bind(context.tenantId, since).all<Record<string, unknown>>(),
      DB.prepare(`SELECT c.id, c.mode, c.status, c.first_question, c.last_question, c.visitor_ip_masked, c.visitor_country, c.visitor_region, c.visitor_city,
        c.visitor_referer, c.visitor_email, c.last_visitor_seen_at, c.offline_email_sent_at, c.last_message_at,
        COALESCE(l.name,'') AS lead_name, COALESCE(l.company,'') AS lead_company, COALESCE(l.status,'') AS lead_status
        FROM customer_conversations c LEFT JOIN customer_leads l ON l.id = c.lead_id AND l.tenant_id = c.tenant_id
        WHERE c.tenant_id = ? ORDER BY c.last_message_at DESC LIMIT 160`).bind(context.tenantId).all<Record<string, unknown>>(),
      DB.prepare(`SELECT COUNT(*) AS tickets,
        COALESCE(AVG(CASE WHEN first_response_at IS NOT NULL THEN (julianday(first_response_at) - julianday(created_at)) * 86400 END),0) AS avg_first_response_seconds,
        COALESCE(AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 86400 END),0) AS avg_resolution_seconds,
        COALESCE(SUM(CASE WHEN sla_due_at < ? AND status IN ('open','processing') THEN 1 ELSE 0 END),0) AS sla_breached,
        COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END),0) AS resolved_tickets
        FROM support_tickets WHERE tenant_id = ? AND created_at >= ?`).bind(now.toISOString(), context.tenantId, since).first<Record<string, number>>(),
      DB.prepare(`SELECT tm.id, COALESCE(tm.display_name,tm.email) AS name,
          COUNT(t.id) AS assigned, COALESCE(SUM(CASE WHEN t.status = 'resolved' THEN 1 ELSE 0 END),0) AS resolved,
          COALESCE(AVG(CASE WHEN t.first_response_at IS NOT NULL THEN (julianday(t.first_response_at)-julianday(t.created_at))*86400 END),0) AS avg_first_response_seconds
        FROM tenant_members tm LEFT JOIN support_tickets t ON t.tenant_id = tm.tenant_id AND t.assignee_member_id = tm.id AND t.created_at >= ?
        WHERE tm.tenant_id = ? AND tm.status = 'active' GROUP BY tm.id, name ORDER BY assigned DESC, name LIMIT 30`).bind(since, context.tenantId).all<Record<string, unknown>>(),
      DB.prepare(`SELECT c.id, c.mode, c.status, c.assigned_member_id,
          CASE WHEN c.mode = 'human' AND c.status = 'handoff' AND t.first_response_at IS NULL AND t.status IN ('open','processing') THEN 1 ELSE 0 END AS waiting,
          (SELECT COUNT(*) FROM customer_messages m WHERE m.tenant_id = c.tenant_id AND m.conversation_id = c.id AND m.role = 'user' AND m.created_at > COALESCE(r.last_read_at,'')) AS unread
        FROM customer_conversations c
        LEFT JOIN customer_conversation_reads r ON r.tenant_id = c.tenant_id AND r.conversation_id = c.id AND r.member_id = ?
        LEFT JOIN support_tickets t ON t.id = (SELECT t2.id FROM support_tickets t2 WHERE t2.tenant_id = c.tenant_id AND t2.conversation_id = c.id ORDER BY CASE WHEN t2.status IN ('open','processing') THEN 0 ELSE 1 END, t2.created_at DESC LIMIT 1)
        WHERE c.tenant_id = ? AND c.status <> 'resolved' ORDER BY c.last_message_at DESC LIMIT 200`).bind(memberId, context.tenantId).all<Record<string, unknown>>(),
      DB.prepare(`SELECT COUNT(*) AS online_agents FROM customer_service_presence p JOIN tenant_members tm ON tm.id = p.member_id AND tm.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND tm.status = 'active' AND p.updated_at >= ? AND p.status IN ('online','busy','away')`).bind(context.tenantId, presenceFreshAfter).first<Record<string, number>>(),
    ]);

    const total = Number(conversation?.total || 0); const aiResolved = Number(conversation?.ai_resolved || 0); const handoff = Number(conversation?.handoff || 0); const resolved = Number(conversation?.resolved || 0);
    const inbox = (inboxRows.results as Array<Record<string, unknown>>).map((row) => ({ waiting: Boolean(row.waiting), unread: Number(row.unread || 0), assignedMemberId: String(row.assigned_member_id || "") }));
    const traces = (traceRows.results as Array<Record<string, unknown>>).map((row) => {
      const sources = safeSources(row.sources_json) as Array<Record<string, unknown>>;
      const vectorScores = sources.map((item) => sourceScore(item, "vector")).filter((item) => item > 0);
      const rerankScores = sources.map((item) => sourceScore(item, "rerank")).filter((item) => item > 0);
      const confidenceScores = sources.map((item) => sourceScore(item, "confidence")).filter((item) => item > 0);
      const bestVector = vectorScores.length ? Math.max(...vectorScores) : 0; const bestRerank = rerankScores.length ? Math.max(...rerankScores) : 0; const avgConfidence = average(confidenceScores);
      return { id: row.id, requestId: row.request_id, model: row.model, question: row.question, answer: row.answer || "", totalTokens: Number(row.total_tokens || 0), latencyMs: Number(row.latency_ms || 0), costMicros: Number(row.cost_micros || 0), grounded: Boolean(row.grounded), qualityScore: Number(row.quality_score_milli || 0) / 1000, status: row.status, createdAt: row.created_at,
        sources: sources.slice(0, 10), stages: [
          { name: "RAG 检索", status: sources.length ? "success" : row.status === "fallback" ? "no_match" : "warning", detail: sources.length ? `召回 ${sources.length} 个知识片段` : "没有召回可用知识", metric: `${sources.length} chunks` },
          { name: "Embedding", status: bestVector > 0 ? "success" : sources.length ? "unknown" : "not_run", detail: bestVector > 0 ? "向量相似度已记录" : "当前 Trace 没有向量分数", metric: bestVector > 0 ? bestVector.toFixed(3) : "—" },
          { name: "Rerank", status: bestRerank > 0 ? "success" : sources.length ? "not_run" : "not_run", detail: bestRerank > 0 ? "重排分数已记录" : "未记录重排分数", metric: bestRerank > 0 ? bestRerank.toFixed(3) : "—" },
          { name: "大模型", status: row.status === "success" ? "success" : row.status === "error" ? "error" : "skipped", detail: row.status === "success" ? String(row.model) : row.status === "fallback" ? "资料不足，未调用生成模型" : "上游模型调用失败", metric: row.status === "success" ? `${Number(row.latency_ms || 0)} ms` : "—" },
        ], evidence: { bestVector, bestRerank, avgConfidence } };
    });

    const ticketCount = Number(ticketMetrics?.tickets || 0); const resolvedTickets = Number(ticketMetrics?.resolved_tickets || 0);
    return Response.json({
      rangeDays: days,
      summary: {
        conversations: total, aiResolved, automationRate: total ? Math.round(aiResolved / total * 100) : 0, handoff, handoffRate: total ? Math.round(handoff / total * 100) : 0,
        resolved, verifiedResolved: Number(conversation?.verified_resolved || 0), resolutionRate: total ? Math.round(resolved / total * 100) : 0,
        faqCount: Number(faq?.total || 0), faqHits: Number(faq?.hits || 0), modelCallsSaved: Number(faq?.hits || 0),
        leads: Number(lead?.leads || 0), pipelineCents: Number(lead?.pipeline || 0), wonCents: Number(lead?.won || 0), openTickets: Number(ticket?.open_tickets || 0),
        modelRequests: Number(usage?.requests || 0), modelCostCents: Math.round(Number(usage?.cost_micros || 0) / 10000), avgLatencyMs: Math.round(Number(usage?.avg_latency || 0)),
        costPerConversationCents: total ? Math.round(Number(usage?.cost_micros || 0) / 10000 / total) : 0,
        avgFirstResponseSeconds: Math.round(Number(ticketMetrics?.avg_first_response_seconds || 0)), avgResolutionSeconds: Math.round(Number(ticketMetrics?.avg_resolution_seconds || 0)),
        slaBreached: Number(ticketMetrics?.sla_breached || 0), ticketResolutionRate: ticketCount ? Math.round(resolvedTickets / ticketCount * 100) : 0,
        unread: inbox.reduce((sum, item) => sum + item.unread, 0), waiting: inbox.filter((item) => item.waiting).length,
        mine: memberId ? inbox.filter((item) => item.assignedMemberId === memberId).length : 0, onlineAgents: Number(onlineRow?.online_agents || 0),
      },
      trend: buildTrend(now, days, dailyRows.results as Array<Record<string, unknown>>),
      countries: countryRows.results.map((row) => ({ country: row.country, count: Number(row.count || 0) })),
      agentPerformance: agentRows.results.map((row) => ({ memberId: row.id, name: row.name, assigned: Number(row.assigned || 0), resolved: Number(row.resolved || 0), avgFirstResponseSeconds: Math.round(Number(row.avg_first_response_seconds || 0)) })),
      traces, visitors: visitorRows.results.map(visitorJson),
    });
  } catch (error) { return routeError(error); }
}
