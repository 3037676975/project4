import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, routeError } from "../../../lib/tenant";

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime();
    const [summary, recent, traces, tenant] = await Promise.all([
      DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS total_tokens, COALESCE(SUM(credits), 0) AS credits,
        COALESCE(SUM(cost_micros), 0) AS cost_micros, COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
        COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS successes,
        COALESCE(SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END), 0) AS fallbacks
        FROM usage_records WHERE tenant_id = ?`).bind(context.tenantId).first<Record<string, number>>(),
      DB.prepare(`SELECT id, request_id, model, total_tokens, latency_ms, source_count, credits, cost_micros, status, created_at
        FROM usage_records WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20`).bind(context.tenantId).all(),
      DB.prepare(`SELECT id, request_id, model, question, total_tokens, latency_ms, credits, cost_micros, grounded, quality_score_milli, status, created_at
        FROM traces WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20`).bind(context.tenantId).all(),
      DB.prepare("SELECT credits_balance FROM tenants WHERE id = ?").bind(context.tenantId).first<{ credits_balance: number }>(),
    ]);
    return Response.json({ summary: { requests: Number(summary?.requests ?? 0), totalTokens: Number(summary?.total_tokens ?? 0), avgLatencyMs: Math.round(Number(summary?.avg_latency_ms ?? 0)), successes: Number(summary?.successes ?? 0), fallbacks: Number(summary?.fallbacks ?? 0), creditsUsed: Number(summary?.credits ?? 0), costMicros: Number(summary?.cost_micros ?? 0), costCents: Math.round(Number(summary?.cost_micros ?? 0) / 10000), creditsBalance: tenant?.credits_balance ?? 0 },
      recent: (recent.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, requestId: row.request_id, model: row.model, totalTokens: row.total_tokens, latencyMs: row.latency_ms, sourceCount: row.source_count, credits: row.credits, costMicros: row.cost_micros, status: row.status, createdAt: row.created_at })),
      traces: (traces.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, requestId: row.request_id, model: row.model, question: row.question, totalTokens: row.total_tokens, latencyMs: row.latency_ms, credits: row.credits, costMicros: row.cost_micros, grounded: Boolean(row.grounded), qualityScore: Number(row.quality_score_milli) / 1000, status: row.status, createdAt: row.created_at })) });
  } catch (error) { return routeError(error); }
}
