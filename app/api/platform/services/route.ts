import { requirePlatformAdmin, platformRouteError } from "../../../../lib/platform-admin";
import { loadPlatformProviderRows } from "../../../../lib/platform-provider";
import { getRuntime } from "../../../../lib/runtime";

type ServiceState = { id: string; name: string; status: "healthy" | "degraded" | "stopped"; detail: string };

async function jsonHealth(id: string, name: string, url: string, headers: Record<string, string>, inspect?: (data: Record<string, unknown>) => string): Promise<ServiceState> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) return { id, name, status: "degraded", detail: typeof data.detail === "string" ? data.detail : `HTTP ${response.status}` };
    return { id, name, status: "healthy", detail: inspect?.(data) || "运行正常" };
  } catch {
    return { id, name, status: "stopped", detail: "未运行或暂不可达" };
  }
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request, ["super_admin"]);
    const runtime = getRuntime();
    const rows = await loadPlatformProviderRows();
    const embedding = rows.find((row) => row.kind === "embedding");
    const rerank = rows.find((row) => row.kind === "rerank");
    const embeddingReady = embedding?.provider === "siliconflow" && Boolean(embedding.api_key_hint);
    const rerankReady = rerank?.provider === "siliconflow" && Boolean(rerank.api_key_hint || (rerank.reuse_api_key_from === "embedding" && embeddingReady));
    const services: ServiceState[] = [
      { id: "embedding", name: "Embedding", status: embeddingReady ? "healthy" : embedding ? "degraded" : "stopped", detail: embeddingReady ? "硅基流动 · BAAI/bge-m3 · API 已配置" : "等待配置硅基流动 API Key" },
      { id: "rerank", name: "Rerank", status: rerankReady ? "healthy" : rerank ? "degraded" : "stopped", detail: rerankReady ? "硅基流动 · BAAI/bge-reranker-v2-m3" : "等待配置或复用 Embedding API Key" },
      await jsonHealth("paddleocr", "PaddleOCR 本地免费 OCR", "http://paddleocr:8002/health", runtime.PARSER_API_KEY ? { Authorization: `Bearer ${runtime.PARSER_API_KEY}` } : {}, (data) => `${String(data.engine || "PaddleOCR")} · ${String(data.recognitionModel || "PP-OCRv6-small")} · CPU · 企业唯一 OCR`),
      await jsonHealth("qdrant", "向量数据库", `${(runtime.QDRANT_URL || "http://qdrant:6333").replace(/\/$/, "")}/collections`, runtime.QDRANT_API_KEY ? { "api-key": runtime.QDRANT_API_KEY } : {}, () => "Qdrant 集合服务正常"),
    ];
    return Response.json({ checkedAt: new Date().toISOString(), localOcrMode: "paddleocr", services });
  } catch (error) { return platformRouteError(error); }
}
