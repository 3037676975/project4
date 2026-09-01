import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime(); const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [settings, finance, byModel] = await Promise.all([
      DB.prepare(`SELECT id, model_pattern, input_micros_per_million, output_micros_per_million, request_micros, ocr_micros_per_page, active, updated_at
        FROM cost_settings WHERE tenant_id = ? ORDER BY model_pattern`).bind(context.tenantId).all(),
      DB.prepare(`SELECT
        (SELECT COALESCE(SUM(amount_cents), 0) FROM billing_orders WHERE tenant_id = ? AND status IN ('fulfilled','refunded') AND fulfilled_at >= ?) AS revenue_cents,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM refund_requests WHERE tenant_id = ? AND status = 'refunded' AND updated_at >= ?) AS refunded_cents,
        (SELECT COALESCE(SUM(cost_micros), 0) FROM usage_records WHERE tenant_id = ? AND created_at >= ?) AS cost_micros,
        (SELECT COUNT(*) FROM usage_records WHERE tenant_id = ? AND created_at >= ?) AS requests`
      ).bind(context.tenantId, since, context.tenantId, since, context.tenantId, since, context.tenantId, since).first<Record<string, number>>(),
      DB.prepare(`SELECT model, COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(cost_micros), 0) AS cost_micros
        FROM usage_records WHERE tenant_id = ? AND created_at >= ? GROUP BY model ORDER BY cost_micros DESC LIMIT 30`).bind(context.tenantId, since).all(),
    ]);
    const revenueCents = Number(finance?.revenue_cents || 0) - Number(finance?.refunded_cents || 0); const costMicros = Number(finance?.cost_micros || 0); const costCents = Math.round(costMicros / 10000); const grossProfitCents = revenueCents - costCents;
    return Response.json({ periodDays: 30, summary: { revenueCents, refundedCents: Number(finance?.refunded_cents || 0), costMicros, costCents, grossProfitCents,
      grossMargin: revenueCents > 0 ? Math.round(grossProfitCents / revenueCents * 1000) / 10 : null, requests: Number(finance?.requests || 0) },
      settings: (settings.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, modelPattern: row.model_pattern, inputYuanPerMillion: Number(row.input_micros_per_million) / 1_000_000, outputYuanPerMillion: Number(row.output_micros_per_million) / 1_000_000, requestYuan: Number(row.request_micros) / 1_000_000, ocrYuanPerPage: Number(row.ocr_micros_per_page) / 1_000_000, active: Boolean(row.active), updatedAt: row.updated_at })),
      byModel: (byModel.results as Array<Record<string, unknown>>).map((row) => ({ model: row.model, requests: row.requests, tokens: row.tokens, costMicros: row.cost_micros, costCents: Math.round(Number(row.cost_micros) / 10000) })) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); const body = await request.json() as Record<string, unknown>;
    const modelPattern = typeof body.modelPattern === "string" ? body.modelPattern.trim().slice(0, 160) : "";
    if (!modelPattern || !/^[a-zA-Z0-9._:/*-]+$/.test(modelPattern)) return Response.json({ error: "模型匹配名称格式无效。" }, { status: 400 });
    const rates = [body.inputYuanPerMillion, body.outputYuanPerMillion, body.requestYuan, body.ocrYuanPerPage].map(Number);
    if (rates.some((value) => !Number.isFinite(value) || value < 0 || value > 100000)) return Response.json({ error: "成本单价必须是 0 到 100000 之间的数字。" }, { status: 400 });
    const values = rates.map((value) => Math.round(value * 1_000_000)); const now = new Date().toISOString(); const id = `cost_${context.tenantId.slice(-10)}_${modelPattern.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}`;
    await getRuntime().DB.prepare(`INSERT INTO cost_settings
      (id, tenant_id, model_pattern, input_micros_per_million, output_micros_per_million, request_micros, ocr_micros_per_page, active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, model_pattern) DO UPDATE SET input_micros_per_million = excluded.input_micros_per_million,
      output_micros_per_million = excluded.output_micros_per_million, request_micros = excluded.request_micros,
      ocr_micros_per_page = excluded.ocr_micros_per_page, active = excluded.active, updated_at = excluded.updated_at`)
      .bind(id, context.tenantId, modelPattern, values[0], values[1], values[2], values[3], body.active === false ? 0 : 1, now).run();
    return Response.json({ saved: true, id, modelPattern, updatedAt: now });
  } catch (error) { return routeError(error); }
}
