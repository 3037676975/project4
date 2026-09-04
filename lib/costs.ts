import { getRuntime } from "./runtime";

export async function calculateModelCost(input: { tenantId: string; model: string; promptTokens: number; completionTokens: number }) {
  const row = await getRuntime().DB.prepare(`SELECT input_micros_per_million, output_micros_per_million, request_micros
    FROM cost_settings WHERE tenant_id = ? AND active = 1 AND model_pattern IN (?, '*')
    ORDER BY CASE WHEN model_pattern = ? THEN 0 ELSE 1 END LIMIT 1`)
    .bind(input.tenantId, input.model, input.model).first<{ input_micros_per_million: number; output_micros_per_million: number; request_micros: number }>();
  if (!row) return 0;
  return Math.max(0, Math.round(row.request_micros + input.promptTokens * row.input_micros_per_million / 1_000_000 + input.completionTokens * row.output_micros_per_million / 1_000_000));
}

export async function calculateOcrCost(input: { tenantId: string; engine: string; pages: number }) {
  if (/paddleocr/i.test(input.engine)) return 0;
  const row = await getRuntime().DB.prepare(`SELECT ocr_micros_per_page FROM cost_settings
    WHERE tenant_id = ? AND active = 1 AND model_pattern IN (?, 'ocr:*', '*')
    ORDER BY CASE WHEN model_pattern = ? THEN 0 WHEN model_pattern = 'ocr:*' THEN 1 ELSE 2 END LIMIT 1`)
    .bind(input.tenantId, input.engine, input.engine).first<{ ocr_micros_per_page: number }>();
  return Math.max(0, Math.round((row?.ocr_micros_per_page || 0) * Math.max(1, input.pages)));
}

export async function recordExternalUsage(input: { tenantId: string; model: string; promptTokens: number; completionTokens?: number; sourceCount?: number; latencyMs?: number }) {
  const completionTokens = Math.max(0, Math.round(input.completionTokens || 0)); const promptTokens = Math.max(0, Math.round(input.promptTokens));
  const costMicros = await calculateModelCost({ tenantId: input.tenantId, model: input.model, promptTokens, completionTokens });
  await getRuntime().DB.prepare(`INSERT INTO usage_records
    (id, tenant_id, request_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, source_count, credits, cost_micros, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'success', ?)`
    .bind(crypto.randomUUID(), input.tenantId, `svc_${crypto.randomUUID()}`, input.model, promptTokens, completionTokens, promptTokens + completionTokens,
      Math.max(0, Math.round(input.latencyMs || 0)), Math.max(0, Math.round(input.sourceCount || 0)), costMicros, new Date().toISOString()).run();
  return costMicros;
}
