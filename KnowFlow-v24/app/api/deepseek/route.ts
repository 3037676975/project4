import { completeOnce, parseMessages, prepareCompletion } from "../../../lib/completion";
import { PublicApiError } from "../../../lib/api-keys";
import { getOrCreateTenant, routeError } from "../../../lib/tenant";

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request);
    let question = ""; let knowledgeBaseId = ""; try { const body = await request.json() as { question?: unknown; knowledgeBaseId?: unknown }; question = typeof body.question === "string" ? body.question.trim() : ""; knowledgeBaseId = typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId.trim() : ""; } catch { throw new PublicApiError(400, "请求内容不是有效 JSON。"); }
    if (!question) return Response.json({ error: "请输入测试问题。" }, { status: 400 });
    if (question.length > 4000) return Response.json({ error: "测试问题不能超过 4000 个字符。" }, { status: 400 });
    const messages = parseMessages([{ role: "user", content: question }]);
    const prepared = await prepareCompletion({ tenantId: context.tenantId, knowledgeBaseId: knowledgeBaseId || null, messages });
    const result = await completeOnce(prepared, 1000);
    return Response.json({ answer: result.answer, model: result.upstreamModel, modelAlias: prepared.assistant.modelAlias, usage: result.usage, latency_ms: result.latencyMs, traceId: result.traceId, requestId: result.requestId, credits: result.credits,
      grounded: result.grounded, qualityScore: Number(result.qualityScore.toFixed(3)), threshold: prepared.assistant.qualityThreshold,
      sources: prepared.sources.map((source) => ({ documentId: source.documentId, document: source.document, chunkId: source.chunkId, score: Number(source.rerankScore.toFixed(3)), confidenceScore: Number(source.confidenceScore.toFixed(3)), vectorScore: Number(source.vectorScore.toFixed(3)), lexicalScore: Number(source.lexicalScore.toFixed(3)), excerpt: source.text.slice(0, 260) })) });
  } catch (error) {
    if (error instanceof PublicApiError) return Response.json({ configured: error.code !== "provider_not_configured", error: error.message }, { status: error.status });
    return routeError(error);
  }
}
