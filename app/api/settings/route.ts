import { encryptSecret } from "../../../lib/crypto";
import { ensurePlatformProviderConfigs, loadEffectiveProviderRows, loadPlatformProviderRows, type ProviderConfigRow } from "../../../lib/platform-provider";
import { platformRouteError, requirePlatformAdmin, writePlatformAudit } from "../../../lib/platform-admin";
import {
  normalizeBaiduOcrBaseUrl,
  normalizeDeepSeekBaseUrl,
  normalizeEmbeddingBaseUrl,
  normalizeSelfHostedBaseUrl,
  normalizeSiliconFlowBaseUrl,
  normalizeTencentOcrBaseUrl,
  ProviderKind,
} from "../../../lib/provider";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant } from "../../../lib/tenant";

type SettingsPayload = {
  kind?: unknown; provider?: unknown; baseUrl?: unknown; model?: unknown; secondaryModel?: unknown; dimensions?: unknown;
  apiKey?: unknown; credentialId?: unknown; region?: unknown; reuseEmbeddingKey?: unknown;
  candidateCount?: unknown; topN?: unknown;
};

const DEFAULTS: Record<ProviderKind, {
  provider: string; baseUrl: string; model: string; secondaryModel: string | null;
  dimensions: number | null; region: string | null;
}> = {
  generation: { provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", secondaryModel: null, dimensions: null, region: null },
  embedding: { provider: "infinity", baseUrl: "https://embedding.example.com/v1", model: "BAAI/bge-m3", secondaryModel: null, dimensions: 1024, region: null },
  rerank: { provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-reranker-v2-m3", secondaryModel: null, dimensions: null, region: null },
  ocr: { provider: "docling", baseUrl: "https://parser.example.com", model: "rapidocr", secondaryModel: null, dimensions: null, region: null },
};

function parseKind(value: unknown): ProviderKind {
  if (value === "embedding" || value === "rerank" || value === "ocr") return value;
  return "generation";
}

function allowedProvider(kind: ProviderKind, value: unknown) {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (kind === "generation") return "deepseek";
  if (kind === "embedding" && (provider === "infinity" || provider === "openai")) return provider;
  if (kind === "rerank" && provider === "siliconflow") return provider;
  if (kind === "ocr" && ["docling", "compatible", "openai", "baidu", "tencent"].includes(provider)) return provider;
  if (kind === "embedding") throw new Error("Embedding 仅支持 Infinity 或 OpenAI。");
  if (kind === "rerank") throw new Error("Rerank 当前仅支持硅基流动。");
  throw new Error("OCR 服务商无效。");
}

function normalizeBaseUrl(kind: ProviderKind, provider: string, value: string) {
  if (kind === "generation") return normalizeDeepSeekBaseUrl(value);
  if (kind === "rerank") return normalizeSiliconFlowBaseUrl(value);
  if (kind === "ocr" && provider === "baidu") return normalizeBaiduOcrBaseUrl(value);
  if (kind === "ocr" && provider === "tencent") return normalizeTencentOcrBaseUrl(value);
  if (provider === "openai") return normalizeEmbeddingBaseUrl(value);
  return normalizeSelfHostedBaseUrl(value, kind === "embedding" ? "自建 Embedding 地址" : "OCR 服务地址");
}

function hint(value: string) {
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

function needsCredentialId(kind: ProviderKind, provider: string) {
  return kind === "ocr" && (provider === "baidu" || provider === "tencent");
}

function serializeSettings(
  rows: Map<ProviderKind, { row: ProviderConfigRow; scope: "platform" | "tenant" }>,
  includeHints: boolean,
) {
  const serialize = (kind: ProviderKind) => {
    const entry = rows.get(kind); const row = entry?.row; const fallback = DEFAULTS[kind];
    const reusedEntry = row?.reuse_api_key_from === "embedding" ? rows.get("embedding") : null;
    const effectiveKeyHint = row?.api_key_hint ?? reusedEntry?.row.api_key_hint ?? null;
    const provider = String(row?.provider ?? fallback.provider);
    return {
      kind, provider, baseUrl: row?.base_url ?? fallback.baseUrl, model: row?.model ?? fallback.model,
      secondaryModel: row?.secondary_model ?? fallback.secondaryModel, dimensions: row?.dimensions ?? fallback.dimensions,
      configured: needsCredentialId(kind, provider) ? Boolean(effectiveKeyHint && row?.credential_id_hint) : Boolean(effectiveKeyHint),
      keyHint: includeHints ? effectiveKeyHint : null,
      credentialIdHint: includeHints ? row?.credential_id_hint ?? null : null,
      region: row?.region ?? fallback.region,
      reuseEmbeddingKey: kind === "rerank" ? (row ? row.reuse_api_key_from === "embedding" : true) : false,
      candidateCount: row?.candidate_count ?? (kind === "rerank" ? 12 : null),
      topN: row?.top_n ?? (kind === "rerank" ? 3 : null), updatedAt: row?.updated_at ?? null,
      managedBy: "platform", legacyFallback: entry?.scope === "tenant",
    };
  };
  return { generation: serialize("generation"), embedding: serialize("embedding"), rerank: serialize("rerank"), ocr: serialize("ocr") };
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
  } catch (error) { return platformRouteError(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request, ["super_admin"]);
    await ensurePlatformProviderConfigs(admin);
    const runtime = getRuntime();
    if (!runtime.CONFIG_ENCRYPTION_KEY) return Response.json({ error: "站点加密密钥尚未初始化。" }, { status: 503 });
    let payload: SettingsPayload;
    try { payload = await request.json() as SettingsPayload; }
    catch { return Response.json({ error: "请求内容不是有效 JSON。" }, { status: 400 }); }
    const kind = parseKind(payload.kind);
    let provider: string;
    try { provider = allowedProvider(kind, payload.provider ?? DEFAULTS[kind].provider); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "服务商无效。" }, { status: 400 }); }
    const model = typeof payload.model === "string" ? payload.model.trim() : "";
    if (!/^[a-zA-Z0-9._/-]{2,160}$/.test(model)) return Response.json({ error: "模型或引擎名称格式不正确。" }, { status: 400 });
    if (kind === "ocr" && provider === "baidu" && !["general_basic", "accurate_basic"].includes(model)) return Response.json({ error: "百度云 OCR 支持 general_basic 或 accurate_basic。" }, { status: 400 });
    if (kind === "ocr" && provider === "tencent" && !["GeneralBasicOCR", "GeneralAccurateOCR"].includes(model)) return Response.json({ error: "腾讯云 OCR 支持 GeneralBasicOCR 或 GeneralAccurateOCR。" }, { status: 400 });
    const secondaryModel = kind === "ocr" && provider === "baidu" ? (typeof payload.secondaryModel === "string" && payload.secondaryModel ? payload.secondaryModel : "table")
      : kind === "ocr" && provider === "tencent" ? (typeof payload.secondaryModel === "string" && payload.secondaryModel ? payload.secondaryModel : "RecognizeTableOCR") : null;
    if (kind === "ocr" && provider === "baidu" && secondaryModel !== "table") return Response.json({ error: "百度表格识别接口必须使用 table。" }, { status: 400 });
    if (kind === "ocr" && provider === "tencent" && secondaryModel !== "RecognizeTableOCR") return Response.json({ error: "腾讯云表格识别接口必须使用 RecognizeTableOCR。" }, { status: 400 });
    let baseUrl: string;
    try { baseUrl = normalizeBaseUrl(kind, provider, String(payload.baseUrl || "")); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "API 地址无效。" }, { status: 400 }); }
    const dimensions = kind === "embedding" ? Number(payload.dimensions ?? DEFAULTS.embedding.dimensions) : null;
    if (kind === "embedding" && (!Number.isInteger(dimensions) || Number(dimensions) < 256 || Number(dimensions) > 4096)) return Response.json({ error: "向量维度应在 256 到 4096 之间。" }, { status: 400 });
    if (kind === "embedding" && provider === "infinity" && model === "BAAI/bge-m3" && dimensions !== 1024) return Response.json({ error: "BAAI/bge-m3 的向量维度固定为 1024。" }, { status: 400 });
    const candidateCount = kind === "rerank" ? Number(payload.candidateCount ?? 12) : null;
    const topN = kind === "rerank" ? Number(payload.topN ?? 3) : null;
    if (kind === "rerank" && (!Number.isInteger(candidateCount) || Number(candidateCount) < 2 || Number(candidateCount) > 50)) return Response.json({ error: "Rerank 候选数量应在 2 到 50 之间。" }, { status: 400 });
    if (kind === "rerank" && (!Number.isInteger(topN) || Number(topN) < 1 || Number(topN) > 8 || Number(topN) > Number(candidateCount))) return Response.json({ error: "Rerank 最终保留数量应在 1 到 8 之间，且不能超过候选数量。" }, { status: 400 });
    const region = kind === "ocr" && provider === "tencent"
      ? (typeof payload.region === "string" ? payload.region.trim() : "ap-guangzhou") : null;
    if (region && !/^[a-z]{2,10}(?:-[a-z0-9]{2,20}){1,3}$/.test(region)) return Response.json({ error: "腾讯云地域格式不正确。" }, { status: 400 });

    const current = await runtime.DB.prepare(`SELECT provider, base_url, model, dimensions, api_key_ciphertext, api_key_iv, api_key_hint,
      credential_id_ciphertext, credential_id_iv, credential_id_hint, region, reuse_api_key_from
      FROM platform_provider_configs WHERE kind = ?`).bind(kind).first<{
      provider: string; base_url: string; model: string; dimensions: number | null;
      api_key_ciphertext: string | null; api_key_iv: string | null; api_key_hint: string | null;
      credential_id_ciphertext: string | null; credential_id_iv: string | null; credential_id_hint: string | null;
      region: string | null; reuse_api_key_from: string | null;
    }>();
    const providerChanged = Boolean(current && (current.provider !== provider || current.base_url !== baseUrl));
    let ciphertext = providerChanged || current?.reuse_api_key_from === "embedding" ? null : current?.api_key_ciphertext ?? null;
    let iv = providerChanged || current?.reuse_api_key_from === "embedding" ? null : current?.api_key_iv ?? null;
    let keyHint = providerChanged || current?.reuse_api_key_from === "embedding" ? null : current?.api_key_hint ?? null;
    let credentialCiphertext = providerChanged ? null : current?.credential_id_ciphertext ?? null;
    let credentialIv = providerChanged ? null : current?.credential_id_iv ?? null;
    let credentialIdHint = providerChanged ? null : current?.credential_id_hint ?? null;
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    if (apiKey) {
      if (apiKey.length < 12 || apiKey.length > 500) return Response.json({ error: "密钥长度应为 12 到 500 个字符。" }, { status: 400 });
      const encrypted = await encryptSecret(apiKey, runtime.CONFIG_ENCRYPTION_KEY);
      ciphertext = encrypted.ciphertext; iv = encrypted.iv; keyHint = hint(apiKey);
    }
    const credentialId = typeof payload.credentialId === "string" ? payload.credentialId.trim() : "";
    if (credentialId) {
      if (credentialId.length < 6 || credentialId.length > 300) return Response.json({ error: "凭据 ID 长度应为 6 到 300 个字符。" }, { status: 400 });
      const encrypted = await encryptSecret(credentialId, runtime.CONFIG_ENCRYPTION_KEY);
      credentialCiphertext = encrypted.ciphertext; credentialIv = encrypted.iv; credentialIdHint = hint(credentialId);
    }
    const reuseEmbeddingKey = kind === "rerank" && (typeof payload.reuseEmbeddingKey === "boolean" ? payload.reuseEmbeddingKey : current?.reuse_api_key_from === "embedding");
    let reuseApiKeyFrom: string | null = null;
    if (reuseEmbeddingKey) {
      const embeddingSecret = await runtime.DB.prepare(`SELECT base_url, api_key_ciphertext, api_key_iv, api_key_hint
        FROM platform_provider_configs WHERE kind = 'embedding' AND status = 'active'`)
        .first<{ base_url: string; api_key_ciphertext: string | null; api_key_iv: string | null; api_key_hint: string | null }>();
      if (!embeddingSecret?.api_key_ciphertext || !embeddingSecret.api_key_iv) return Response.json({ error: "请先配置可用的硅基流动 Embedding API Key，再选择复用密钥。" }, { status: 400 });
      if (new URL(embeddingSecret.base_url).hostname !== "api.siliconflow.cn") return Response.json({ error: "只有 Embedding 同样使用硅基流动时，才能复用它的 API Key。" }, { status: 400 });
      ciphertext = null; iv = null; keyHint = embeddingSecret.api_key_hint; credentialCiphertext = null; credentialIv = null; credentialIdHint = null; reuseApiKeyFrom = "embedding";
    }
    if (!reuseEmbeddingKey && (!ciphertext || !iv)) {
      const label = kind === "generation" ? "DeepSeek API Key" : kind === "embedding" ? "Embedding 服务 Token" : kind === "rerank" ? "Rerank API Key" : provider === "baidu" ? "百度云 Secret Key" : provider === "tencent" ? "腾讯云 SecretKey" : "OCR 服务 Token";
      return Response.json({ error: `请填写 ${label}。` }, { status: 400 });
    }
    if (needsCredentialId(kind, provider) && (!credentialCiphertext || !credentialIv)) return Response.json({ error: provider === "baidu" ? "请填写百度云 API Key。" : "请填写腾讯云 SecretId。" }, { status: 400 });
    if (!needsCredentialId(kind, provider)) { credentialCiphertext = null; credentialIv = null; credentialIdHint = null; }

    const updatedAt = new Date().toISOString(); const id = `pprov_${kind}`;
    await runtime.DB.prepare(`INSERT INTO platform_provider_configs
      (id, kind, provider, base_url, model, secondary_model, dimensions, api_key_ciphertext, api_key_iv, api_key_hint,
       credential_id_ciphertext, credential_id_iv, credential_id_hint, region, reuse_api_key_from, candidate_count, top_n,
       status, updated_by_admin_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(kind) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, model = excluded.model,
      secondary_model = excluded.secondary_model, dimensions = excluded.dimensions, api_key_ciphertext = excluded.api_key_ciphertext,
      api_key_iv = excluded.api_key_iv, api_key_hint = excluded.api_key_hint,
      credential_id_ciphertext = excluded.credential_id_ciphertext, credential_id_iv = excluded.credential_id_iv,
      credential_id_hint = excluded.credential_id_hint, region = excluded.region, reuse_api_key_from = excluded.reuse_api_key_from,
      candidate_count = excluded.candidate_count, top_n = excluded.top_n, status = 'active',
      updated_by_admin_id = excluded.updated_by_admin_id, updated_at = excluded.updated_at`)
      .bind(id, kind, provider, baseUrl, model, secondaryModel, dimensions, ciphertext, iv, reuseEmbeddingKey ? null : keyHint,
        credentialCiphertext, credentialIv, credentialIdHint, region, reuseApiKeyFrom, candidateCount, topN,
        admin.id, updatedAt, updatedAt).run();
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
      kind, provider, baseUrl, model, secondaryModel, dimensions, region, reuseEmbeddingKey,
      candidateCount, topN, configured: true, keyHint, credentialIdHint, updatedAt, requiresReindex, managedBy: "platform",
    });
  } catch (error) { return platformRouteError(error); }
}

export async function DELETE(request: Request) {
  try {
    await requirePlatformAdmin(request, ["super_admin"]);
    return Response.json({ error: "平台模型服务不允许从企业端删除；请在超级管理员后台更新服务。" }, { status: 405 });
  } catch (error) { return platformRouteError(error); }
}
