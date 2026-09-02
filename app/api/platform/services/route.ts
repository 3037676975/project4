import { requirePlatformAdmin, platformRouteError } from "../../../../lib/platform-admin";
import { getRuntime } from "../../../../lib/runtime";

type ServiceState = { id: string; name: string; status: "healthy" | "degraded" | "stopped"; detail: string };

async function jsonHealth(id: string, name: string, url: string, headers: Record<string, string>, inspect?: (data: Record<string, unknown>) => string): Promise<ServiceState> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) return { id, name, status: "degraded", detail: `HTTP ${response.status}` };
    return { id, name, status: "healthy", detail: inspect?.(data) || "运行正常" };
  } catch {
    return { id, name, status: "stopped", detail: "未运行或暂不可达" };
  }
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request, ["super_admin"]);
    const runtime = getRuntime();
    const bearer: Record<string, string> = runtime.INFINITY_API_KEY ? { Authorization: `Bearer ${runtime.INFINITY_API_KEY}` } : {};
    const services = await Promise.all([
      jsonHealth("embedding", "Embedding", "http://embedding:7997/v1/models", bearer, (data) => {
        const models = Array.isArray(data.data) ? data.data as Array<{ id?: string }> : [];
        return models.some((item) => item.id === "BAAI/bge-m3") ? "BGE-M3 · 1024 维" : "服务在线，模型仍在加载";
      }),
      jsonHealth("rerank", "Rerank", "http://embedding:7997/v1/models", bearer, (data) => {
        const models = Array.isArray(data.data) ? data.data as Array<{ id?: string }> : [];
        return models.some((item) => item.id === "BAAI/bge-reranker-v2-m3") ? "BGE-Reranker v2-m3" : "服务在线，模型仍在加载";
      }),
      jsonHealth("parser", "文档解析", "http://document-parser:8001/health", runtime.PARSER_API_KEY ? { Authorization: `Bearer ${runtime.PARSER_API_KEY}` } : {}, (data) => String(data.engine || "Docling + RapidOCR")),
      jsonHealth("qdrant", "向量数据库", `${(runtime.QDRANT_URL || "http://qdrant:6333").replace(/\/$/, "")}/collections`, runtime.QDRANT_API_KEY ? { "api-key": runtime.QDRANT_API_KEY } : {}, () => "Qdrant 集合服务正常"),
    ]);
    return Response.json({ checkedAt: new Date().toISOString(), services });
  } catch (error) { return platformRouteError(error); }
}
