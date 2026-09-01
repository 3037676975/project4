import { authenticateCustomerApiKey, consumeApiUsage, openAiErrorResponse, PublicApiError } from "../../../lib/api-keys";
import { loadProviderConfig } from "../../../lib/provider";
import { getRuntime } from "../../../lib/runtime";

export async function POST(request: Request) {
  try {
    const context = await authenticateCustomerApiKey(request, "embeddings");
    let body: { input?: unknown; dimensions?: unknown };
    try { body = await request.json() as typeof body; }
    catch { throw new PublicApiError(400, "Request body must be valid JSON"); }
    const input = typeof body.input === "string"
      ? [body.input]
      : Array.isArray(body.input) && body.input.every((item) => typeof item === "string")
        ? body.input as string[]
        : null;
    if (!input || input.length === 0 || input.length > 128 || input.some((item) => !item.trim() || item.length > 12000)) {
      throw new PublicApiError(400, "input must be a string or an array of up to 128 non-empty strings");
    }
    const config = await loadProviderConfig(context.tenantId, "embedding");
    if (!config) throw new PublicApiError(503, "Embedding provider is not configured", "provider_not_configured");
    const dimensions = body.dimensions === undefined ? config.dimensions : Math.round(Number(body.dimensions));
    if (dimensions && (dimensions < 256 || dimensions > 4096)) throw new PublicApiError(400, "dimensions must be between 256 and 4096");
    if (config.provider !== "openai" && body.dimensions !== undefined && dimensions !== config.dimensions) {
      throw new PublicApiError(400, `This embedding model has a fixed dimension of ${config.dimensions}`);
    }
    const upstream = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, input, ...(config.provider === "openai" && dimensions ? { dimensions } : {}) }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await upstream.json() as {
      object?: string; data?: unknown[]; model?: string; usage?: { prompt_tokens?: number; total_tokens?: number }; error?: { message?: string };
    };
    if (!upstream.ok || !data.data) throw new PublicApiError(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, data.error?.message || "Embedding provider error", "upstream_error");
    const requestId = `req_${crypto.randomUUID().replaceAll("-", "")}`;
    const promptTokens = Number(data.usage?.prompt_tokens ?? Math.ceil(input.join("").length / 3));
    const totalTokens = Number(data.usage?.total_tokens ?? promptTokens);
    const charged = await consumeApiUsage(context, promptTokens, 0, requestId);
    await getRuntime().DB.prepare(`INSERT INTO usage_records
      (id, tenant_id, request_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, source_count, credits, status, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, ?, 'success', ?)`
    ).bind(crypto.randomUUID(), context.tenantId, requestId, data.model || config.model, promptTokens, totalTokens, charged.credits, new Date().toISOString()).run();
    return new Response(JSON.stringify({ object: data.object || "list", data: data.data, model: data.model || config.model, usage: { prompt_tokens: promptTokens, total_tokens: totalTokens } }), {
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  } catch (error) { return openAiErrorResponse(error); }
}
