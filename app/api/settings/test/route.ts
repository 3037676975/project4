import { testBaiduOcr, testTencentOcr } from "../../../../lib/cloud-ocr";
import { platformRouteError, requirePlatformAdmin } from "../../../../lib/platform-admin";
import { ensurePlatformProviderConfigs } from "../../../../lib/platform-provider";
import { loadProviderConfig, ProviderKind } from "../../../../lib/provider";

function parseKind(value: unknown): ProviderKind {
  if (value === "embedding" || value === "rerank" || value === "ocr") return value;
  return "generation";
}

async function safeJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorMessage(data: Record<string, unknown>, fallback: string) {
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request, ["super_admin"]);
    await ensurePlatformProviderConfigs(admin);
    let body: { kind?: unknown } = {};
    try {
      body = await request.json() as { kind?: unknown };
    } catch {
      // Empty input tests the generation provider.
    }
    const kind = parseKind(body.kind);
    const config = await loadProviderConfig("", kind);
    if (!config) return Response.json({ configured: false, error: "请先保存 API 配置。" }, { status: 400 });

    if (kind === "embedding") {
      const response = await fetch(`${config.baseUrl}/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          input: ["中文知识库连接测试"],
          ...(config.provider === "openai" && config.dimensions ? { dimensions: config.dimensions } : {}),
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await safeJson(response) as { data?: Array<{ embedding?: number[] }>; error?: unknown };
      if (!response.ok || !data.data?.[0]?.embedding) {
        return Response.json({ ok: false, error: errorMessage(data as Record<string, unknown>, "Embedding 验证失败。") }, { status: response.status || 502 });
      }
      const dimensions = data.data[0].embedding.length;
      if (config.dimensions && dimensions !== config.dimensions) {
        return Response.json({ ok: false, error: `服务返回 ${dimensions} 维，但当前配置为 ${config.dimensions} 维。` }, { status: 422 });
      }
      return Response.json({ ok: true, message: `${config.provider === "infinity" ? "BGE-M3 / Infinity" : "OpenAI"} 向量连接成功`, dimensions });
    }

    if (kind === "rerank") {
      const response = await fetch(`${config.baseUrl}/rerank`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          query: "台灯使用十七个月后出现故障是否还在保修期",
          documents: ["星云智能台灯整机保修十八个月。", "会员积分将在次年十二月三十一日到期。"],
          return_documents: false,
          top_n: 2,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await safeJson(response) as { results?: Array<{ index?: number; relevance_score?: number }> } & Record<string, unknown>;
      if (!response.ok || !Array.isArray(data.results) || data.results.length === 0) {
        return Response.json({ ok: false, error: errorMessage(data, "Rerank 验证失败。") }, { status: response.status || 502 });
      }
      const first = data.results[0];
      if (first.index !== 0 || !Number.isFinite(Number(first.relevance_score))) {
        return Response.json({ ok: false, error: "Rerank 已响应，但没有把保修资料排在第一位。" }, { status: 422 });
      }
      return Response.json({ ok: true, message: `${config.provider === "infinity" ? "本机 Infinity" : "硅基流动"} BGE-Reranker 连接成功`, score: Number(first.relevance_score) });
    }

    if (kind === "ocr") {
      if (config.provider === "baidu") return Response.json({ ok: true, ...(await testBaiduOcr(config)) });
      if (config.provider === "tencent") return Response.json({ ok: true, ...(await testTencentOcr(config)) });
      if (config.provider === "docling") {
        const response = await fetch(`${config.baseUrl}/health`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        const data = await safeJson(response);
        if (!response.ok) return Response.json({ ok: false, error: errorMessage(data, "Docling OCR 健康检查失败。") }, { status: response.status || 502 });
        return Response.json({ ok: true, message: "Docling + RapidOCR 服务连接成功", engine: data.engine ?? config.model });
      }
      if (config.provider === "compatible") {
        const response = await fetch(`${config.baseUrl}/health`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        const data = await safeJson(response);
        if (!response.ok) return Response.json({ ok: false, error: errorMessage(data, "兼容 OCR 健康检查失败。") }, { status: response.status || 502 });
        return Response.json({ ok: true, message: "兼容 OCR 服务连接成功", engine: data.engine ?? config.model });
      }
      const response = await fetch(`${config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = await safeJson(response);
      if (!response.ok) return Response.json({ ok: false, error: errorMessage(data, "OpenAI OCR 验证失败。") }, { status: response.status || 502 });
      return Response.json({ ok: true, message: "OpenAI OCR 连接成功" });
    }

    const response = await fetch(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const data = await safeJson(response) as { data?: Array<{ id?: string }>; error?: unknown };
    if (!response.ok) return Response.json({ ok: false, error: errorMessage(data as Record<string, unknown>, "DeepSeek 验证失败。") }, { status: response.status || 502 });
    return Response.json({ ok: true, message: "生成模型连接成功", models: data.data?.map((item) => item.id).filter(Boolean).slice(0, 8) ?? [] });
  } catch (error) {
    return platformRouteError(error);
  }
}
