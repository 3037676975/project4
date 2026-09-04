import { encryptSecret } from "../../../lib/crypto";
import { ensurePlatformProviderConfigs, loadEffectiveProviderRows, loadPlatformProviderRows, type ProviderConfigRow } from "../../../lib/platform-provider";
import { platformRouteError, requirePlatformAdmin, writePlatformAudit } from "../../../lib/platform-admin";
import {
  normalizeDeepSeekBaseUrl,
  normalizeEmbeddingBaseUrl,
  normalizeSiliconFlowBaseUrl,
  type ProviderKind,
} from "../../../lib/provider";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant } from "../../../lib/tenant";

type SettingsPayload = {
  kind?: unknown;
  provider?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  dimensions?: unknown;
  apiKey?: unknown;
  reuseEmbeddingKey?: unknown;
  candidateCount?: unknown;
  topN?: unknown;
};

type ProviderDefault = {
  provider: string;
  baseUrl: string;
  model: string;
  dimensions: number | null;
};

const DEFAULTS: Record<Exclude<ProviderKind, "ocr">, ProviderDefault> = {
  generation: { provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", dimensions: null },
  embedding: { provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-m3", dimensions: 1024 },
  rerank: { provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-reranker-v2-m3", dimensions: null },
};

function parseKind(value: unknown): ProviderKind {
  if (value === "embedding" || value === "rerank" || value === "ocr") return value;
  return "generation";
}

function allowedProvider(kind: Exclude<ProviderKind, "ocr">, value: unknown) {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (kind === "generation") return "deepseek";
  if (kind === "embedding" && (provider === "siliconflow" || provider === "openai")) return provider;
  if (kind === "rerank" && provider === "siliconflow") return provider;
  if (kind === "embedding") throw new Error("Embedding 仅支持硅基流动或 OpenAI。");
  throw new Error("Rerank 仅支持硅基流动官方 API。");
}

function normalizeBaseUrl(kind: Exclude<ProviderKind, "ocr">, provider: string, value: string) {
  if (kind === "generation") return normalizeDeepSeekBaseUrl(value);
  if (provider === "siliconflow") return normalizeSiliconFlowBaseUrl(value);
  return normalizeEmbeddingBaseUrl(value);
}

function hint(value: string) {
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

function localOcrSettings(includeHints: boolean) {
  const runtime = getRuntime();
  const configured = runtime.APP_ENV === "local" && Boolean(runtime.PARSER_API_KEY);
  return {
    kind: "ocr" as const,
    provider: "paddleocr",
    baseUrl: "http://paddleocr:8002",
    model: "PP-OCRv6-small",
    secondaryModel: null,
    dimensions: null,
    configured,
    keyHint: includeHints && configured ? "内置服务密钥" : null,
    credentialIdHint: null,
    region: null,
    reuseEmbeddingKey: false,
    candidateCount: null,
    topN: null,
    updatedAt: null,
    managedBy: "builtin",
    legacyFallback: false,
  };
}

function serializeSettings(
  rows: Map<ProviderKind, { row: ProviderConfigRow; scope: "platform" | "tenant" }>,
  includeHints: boolean,
) {
  const serialize = (kind: Exclude<ProviderKind, "ocr">) => {
    const entry = rows.get(kind);
    const row = entry?.row;
    const fallback = DEFAULTS[kind];
    const reusedEntry = row?.reuse_api_key_from === "embedding" ? rows.get("embedding") : null;
    const effectiveKeyHint = row?.api_key_hint ?? reusedEntry?.row.api_key_hint ?? null;
    return {
      kind,
      provider: row?.provider ?? fallback.provider,
      baseUrl: row?.base_url ?? fallback.baseUrl,
      model: row?.model ?? fallback.model,
      secondaryModel: null,
      dimensions: row?.dimensions ?? fallback.dimensions,
      configured: Boolean(effectiveKeyHint),
      keyHint: includeHints ? effectiveKeyHint : null,
      credentialIdHint: null,
      region: null,
      reuseEmbeddingKey: kind === "rerank" ? (row ? row.reuse_api_key_from === "embedding" : true) : false,
      candidateCount: row?.candidate_count ?? (kind === "rerank" ? 12 : null),
      topN: row?.top_n ?? (kind === "rerank" ? 3 : null),
      updatedAt: row?.updated_at ?? null,
      managedBy: "platform",
      legacyFallback: entry?.scope === "tenant",
    };
  };
  return {
    generation: serialize("generation"),
    embedding: serialize("embedding"),
    rerank: serialize("rerank"),
    ocr: localOcrSettings(includeHints),
  };
}

export async function GET(request: Request) {
  try {
    const platformScope = new URL(request.url).searchParams.get("scope") === "platform";
    if (platformScope) {
      const admin = await requirePlatformAdmin(request, ["super_admin"]);
      const migration = await ensurePlatformProviderConfigs(admin);
      const rows = new Map<ProviderKind, { row: ProviderConfigRow; scope: "platform" }>();
      for (const row of await loadPlatformProviderRows()) rows.set(row.kind, { row, scope: "platform" });
      return Response.json({ ...serializeSettings(rows, true), migration });
    }
    const context = await getOrCreateTenant(request);
    return Response.json(serializeSettings(await loadEffectiveProviderRows(context.tenantId), false));
  } catch (error) {
    return platformRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request, ["super_admin"]);
    await ensurePlatformProviderConfigs(admin);
    const runtime = getRuntime();
    if (!runtime.CONFIG_ENCRYPTION_KEY) return Response.json({ error: "站点加密密钥尚未初始化。" }, { status: 503 });

    let payload: SettingsPayload;
    try {
      payload = await request.json() as SettingsPayload;
    } catch {
      return Response.json({ error: "请求内容不是有效 JSON。" }, { status: 400 });
    }

    const parsedKind = parseKind(payload.kind);
    if (parsedKind === "ocr") {
      return Response.json({ error: "OCR 已固定为服务器内置 PaddleOCR，不再接受百度、腾讯云、OpenAI 或其他外部 OCR 配置。" }, { status: 405 });
    }
    const kind: Exclude<ProviderKind, "ocr"> = parsedKind;

    let provider: string;
    try {
      provider = allowedProvider(kind, payload.provider ?? DEFAULTS[kind].provider);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "服务商无效。" }, { status: 400 });
    }

    const model = typeof payload.model === "string" ? payload.model.trim() : "";
    if (!/^[a-zA-Z0-9._/-]{2,160}$/.test(model)) return Response.json({ error: "模型名称格式不正确。" }, { status: 400 });
    if (kind === "embedding" && provider === "siliconflow" && model !== "BAAI/bge-m3") return Response.json({ error: "硅基流动 Embedding 固定使用 BAAI/bge-m3。" }, { status: 400 });
    if (kind === "rerank" && model !== "BAAI/bge-reranker-v2-m3") return Response.json({ error: "硅基流动 Rerank 固定使用 BAAI/bge-reranker-v2-m3。" }, { status: 400 });

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(kind, provider, String(payload.baseUrl || ""));
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "API 地址无效。" }, { status: 400 });
    }

    const dimensions = kind === "embedding" ? Number(payload.dimensions ?? DEFAULTS.embedding.dimensions) : null;
    if (kind === "embedding" && (!Number.isInteger(dimensions) || Number(dimensions) < 256 || Number(dimensions) > 4096)) return Response.json({ error: "向量维度应在 256 到 4096 之间。" }, { status: 400 });
    if (kind === "embedding" && provider === "siliconflow" && dimensions !== 1024) return Response.json({ error: "BAAI/bge-m3 的向量维度固定为 1024。" }, { status: 400 });

    const candidateCount = kind === "rerank" ? Number(payload.candidateCount ?? 12) : null;
    const topN = kind === "rerank" ? Number(payload.topN ?? 3) : null;
    if (kind === "rerank" && (!Number.isInteger(candidateCount) || Number(candidateCount) < 2 || Number(candidateCount) > 50)) return Response.json({ error: "Rerank 候选数量应在 2 到 50 之间。" }, { status: 400 });
    if (kind === "rerank" && (!Number.isInteger(topN) || Number(topN) < 1 || Number(topN) > 8 || Number(topN) > Number(candidateCount))) return Response.json({ error: "Rerank 最终保留数量应在 1 到 8 之间，且不能超过候选数量。" }, { status: 400 });

    const current = await runtime.DB.prepare(`SELECT provider, base_url, model, dimensions, api_key_ciphertext, api_key_iv, api_key_hint, reuse_api_key_from
      FROM platform_provider_configs WHERE kind = ?`).bind(kind).first<{
      provider: string; base_url: string; model: string; dimensions: number | null;
      api_key_ciphertext: string | null; api_key_iv: string | null; api_key_hint: string | null; reuse_api_key_from: string | null;
    }>();

    const providerChanged = Boolean(current && (current.provider !== provider || current.base_url !== baseUrl));
    let ciphertext = providerChanged || current?.reuse_api_key_from === "embedding" ? null : current?.api_key_ciphertext ?? null;
    let iv = providerChanged || current?.reuse_api_key_from === "embedding" ? null : current?.api_key_iv ?? null;
    let keyHint = providerChanged || current?.reuse_api_key_from === "embedding" ? null : current?.api_key_hint ?? null;

    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    if (apiKey) {
      if (apiKey.length < 12 || apiKey.length > 500) return Response.json({ error: "密钥长度应为 12 到 500 个字符。" }, { status: 400 });
      const encrypted = await encryptSecret(apiKey, runtime.CONFIG_ENCRYPTION_KEY);
      ciphertext = encrypted.ciphertext;
      iv = encrypted.iv;
      keyHint = hint(apiKey);
    }

    const reuseEmbeddingKey = kind === "rerank" && (typeof payload.reuseEmbeddingKey === "boolean" ? payload.reuseEmbeddingKey : current?.reuse_api_key_from === "embedding");
    let reuseApiKeyFrom: "embedding" | null = null;
    if (reuseEmbeddingKey) {
      const embeddingSecret = await runtime.DB.prepare(`SELECT provider, base_url, api_key_ciphertext, api_key_iv, api_key_hint
        FROM platform_provider_configs WHERE kind = 'embedding' AND status = 'active' LIMIT 1`)
        .first<{ provider: string; base_url: string; api_key_ciphertext: string | null; api_key_iv: string | null; api_key_hint: string | null }>();
      if (!embeddingSecret?.api_key_ciphertext || !embeddingSecret.api_key_iv) return Response.json({ error: "请先配置可用的 Embedding API Key，再选择复用密钥。" }, { status: 400 });
      if (embeddingSecret.provider !== provider || new URL(embeddingSecret.base_url).origin !== new URL(baseUrl).origin) return Response.json({ error: "Embedding 与 Rerank 必须使用同一服务商和服务主机才能复用 API Key。" }, { status: 400 });
      ciphertext = null;
      iv = null;
      keyHint = embeddingSecret.api_key_hint;
      reuseApiKeyFrom = "embedding";
    }

    if (!reuseEmbeddingKey && (!ciphertext || !iv)) {
      const label = kind === "generation" ? "DeepSeek API Key" : kind === "embedding" ? "Embedding API Key" : "Rerank API Key";
      return Response.json({ error: `请填写 ${label}。` }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const id = `pprov_${kind}`;
    await runtime.DB.prepare(`INSERT INTO platform_provider_configs
      (id, kind, provider, base_url, model, secondary_model, dimensions, api_key_ciphertext, api_key_iv, api_key_hint,
       credential_id_ciphertext, credential_id_iv, credential_id_hint, region, reuse_api_key_from, candidate_count, top_n,
       status, updated_by_admin_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(kind) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, model = excluded.model,
      secondary_model = NULL, dimensions = excluded.dimensions, api_key_ciphertext = excluded.api_key_ciphertext,
      api_key_iv = excluded.api_key_iv, api_key_hint = excluded.api_key_hint,
      credential_id_ciphertext = NULL, credential_id_iv = NULL, credential_id_hint = NULL, region = NULL,
      reuse_api_key_from = excluded.reuse_api_key_from, candidate_count = excluded.candidate_count, top_n = excluded.top_n,
      status = 'active', updated_by_admin_id = excluded.updated_by_admin_id, updated_at = excluded.updated_at`)
      .bind(id, kind, provider, baseUrl, model, dimensions, ciphertext, iv, reuseEmbeddingKey ? null : keyHint,
        reuseApiKeyFrom, candidateCount, topN, admin.id, updatedAt, updatedAt).run();

    const requiresReindex = kind === "embedding" && (!current || current.provider !== provider || current.base_url !== baseUrl || current.model !== model || current.dimensions !== dimensions);
    if (requiresReindex) {
      await runtime.DB.batch([
        runtime.DB.prepare("UPDATE knowledge_documents SET index_status = 'needs_embedding', updated_at = ? WHERE status = 'ready'").bind(updatedAt),
        runtime.DB.prepare("DELETE FROM knowledge_chunks WHERE document_id = 'builtin-implementation-manual'"),
      ]);
    }

    await writePlatformAudit(admin, "provider_config.updated", "platform_provider", kind, {
      provider, model, baseUrl, dimensions, reuseEmbeddingKey, requiresReindex,
    });

    return Response.json({
      kind,
      provider,
      baseUrl,
      model,
      secondaryModel: null,
      dimensions,
      region: null,
      reuseEmbeddingKey,
      candidateCount,
      topN,
      configured: true,
      keyHint,
      credentialIdHint: null,
      updatedAt,
      requiresReindex,
      managedBy: "platform",
    });
  } catch (error) {
    return platformRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePlatformAdmin(request, ["super_admin"]);
    return Response.json({ error: "平台模型服务不允许从企业端删除；请在超级管理员后台更新服务。" }, { status: 405 });
  } catch (error) {
    return platformRouteError(error);
  }
}
