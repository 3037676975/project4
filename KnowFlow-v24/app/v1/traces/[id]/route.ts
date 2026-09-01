import { authenticateCustomerApiKey, openAiErrorResponse, PublicApiError } from "../../../../lib/api-keys";
import { getRuntime } from "../../../../lib/runtime";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateCustomerApiKey(request, "traces"); const { id } = await params;
    const row = await getRuntime().DB.prepare(`SELECT id, request_id, assistant_id, model, question, answer, sources_json,
      prompt_tokens, completion_tokens, total_tokens, latency_ms, credits, status, created_at FROM traces
      WHERE tenant_id = ? AND (id = ? OR request_id = ?) LIMIT 1`).bind(context.tenantId, id, id).first<Record<string, unknown>>();
    if (!row) throw new PublicApiError(404, "Trace not found", "not_found");
    return Response.json({ id: row.id, object: "kb.trace", request_id: row.request_id, assistant_id: row.assistant_id, model: row.model, question: row.question, answer: row.answer, sources: JSON.parse(String(row.sources_json)), usage: { prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, total_tokens: row.total_tokens }, latency_ms: row.latency_ms, credits: row.credits, status: row.status, created_at: row.created_at });
  } catch (error) { return openAiErrorResponse(error); }
}
