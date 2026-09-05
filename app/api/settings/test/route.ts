import { platformRouteError, requirePlatformAdmin } from "../../../../lib/platform-admin";
import { ensurePlatformProviderConfigs } from "../../../../lib/platform-provider";
import { loadProviderConfig, type ProviderKind } from "../../../../lib/provider";

const OCR_SMOKE_TEST_PNG_BASE64 = "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";

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
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  return fallback;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
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
    if (!config) {
      const message = kind === "ocr" ? "本地 PaddleOCR 尚未启动。" : "请先保存 API 配置。";
      return Response.json({ configured: false, error: message }, { status: 400 });
    }

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
      return Response.json({ ok: true, message: `${config.provider === "siliconflow" ? "BGE-M3 / 硅基流动" : "OpenAI"} 向量连接成功`, dimensions });
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
      return Response.json({ ok: true, message: "硅基流动 BGE-Reranker 连接成功", score: Number(first.relevance_score) });
    }

    if (kind === "ocr") {
      try {
        // Do not treat /health as proof that OCR works. This sends a real PNG
        // through the exact /v1/parse endpoint used by tenant uploads, so the
        // button now verifies model inference, multipart parsing and output.
        const form = new FormData();
        const image = new File([decodeBase64(OCR_SMOKE_TEST_PNG_BASE64)], "paddleocr-smoke-test.png", { type: "image/png" });
        form.append("file", image, image.name);
        form.append("mode", "text");
        const response = await fetch(`${config.baseUrl}/v1/parse`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(90000),
        });
        const data = await safeJson(response) as Record<string, unknown> & { text?: string; markdown?: string; engine?: string; pageCount?: number };
        if (!response.ok) {
          return Response.json({ ok: false, error: errorMessage(data, "PaddleOCR 实际识别失败。") }, { status: response.status || 502 });
        }
        const text = String(data.text || data.markdown || "").trim();
        if (!text) return Response.json({ ok: false, error: "PaddleOCR 服务已连接，但实际推理没有返回文字。" }, { status: 422 });
        return Response.json({
          ok: true,
          message: "本地 PaddleOCR 实际识别成功",
          engine: data.engine ?? config.model,
          sample: text.slice(0, 80),
          pageCount: Number(data.pageCount || 1),
        });
      } catch (error) {
        return Response.json({ ok: false, error: error instanceof Error ? `本地 PaddleOCR 实际识别不可用：${error.message}` : "本地 PaddleOCR 实际识别不可用" }, { status: 502 });
      }
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
