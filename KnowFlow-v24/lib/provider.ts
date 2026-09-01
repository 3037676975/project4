import { decryptSecret } from "./crypto";
import { PROVIDER_SELECT_COLUMNS, type ProviderConfigRow } from "./platform-provider";
import { getRuntime } from "./runtime";

export type ProviderKind = "generation" | "embedding" | "rerank" | "ocr";
export type StoredProviderConfig = {
  id: string; kind: ProviderKind; provider: string; baseUrl: string; model: string;
  secondaryModel: string | null; dimensions: number | null; apiKey: string; keyHint: string | null;
  credentialId: string | null; credentialIdHint: string | null; region: string | null;
  reuseApiKeyFrom: ProviderKind | null; candidateCount: number | null; topN: number | null;
};

export function normalizeDeepSeekBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.hostname !== "api.deepseek.com") throw new Error("生成模型当前仅允许 DeepSeek 官方 HTTPS API 地址");
  if (url.pathname !== "/" && url.pathname !== "/v1" && url.pathname !== "/v1/") throw new Error("API 地址应为 https://api.deepseek.com 或 https://api.deepseek.com/v1");
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

export function normalizeEmbeddingBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.hostname !== "api.openai.com") throw new Error("OpenAI 向量服务仅允许官方 HTTPS API 地址");
  if (url.pathname !== "/v1" && url.pathname !== "/v1/") throw new Error("API 地址应为 https://api.openai.com/v1");
  return `${url.origin}/v1`;
}

export function normalizeSiliconFlowBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.hostname !== "api.siliconflow.cn") throw new Error("Rerank 当前仅允许硅基流动官方 HTTPS API 地址");
  if (url.pathname !== "/v1" && url.pathname !== "/v1/") throw new Error("API 地址应为 https://api.siliconflow.cn/v1");
  return `${url.origin}/v1`;
}

export function normalizeBaiduOcrBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.hostname !== "aip.baidubce.com" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("百度云 OCR 地址应为 https://aip.baidubce.com");
  }
  return "https://aip.baidubce.com";
}

export function normalizeTencentOcrBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.hostname !== "ocr.tencentcloudapi.com" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("腾讯云 OCR 地址应为 https://ocr.tencentcloudapi.com");
  }
  return "https://ocr.tencentcloudapi.com";
}

/**
 * Tenant-controlled model endpoints are called by the Worker, so reject the
 * common local, metadata and private-network targets before storing them.
 * Production deployments should additionally keep these services behind a
 * public HTTPS reverse proxy and a long bearer token.
 */
export function normalizeSelfHostedBaseUrl(value: string, label: string) {
  const url = new URL(value.trim());
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const localService = getRuntime().APP_ENV === "local" && ["embedding", "document-parser", "localhost", "127.0.0.1"].includes(hostname);
  if (localService) {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${label}本地服务地址无效`);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }
  const forbiddenName = hostname === "localhost" || hostname === "metadata.google.internal"
    || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost");
  const ipLiteral = hostname.includes(":") || /^\d+(?:\.\d+){3}$/.test(hostname);
  if (url.protocol !== "https:") throw new Error(`${label}必须使用公网 HTTPS 地址`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label}不能包含账号、查询参数或锚点`);
  if (url.port && url.port !== "443") throw new Error(`${label}仅允许标准 HTTPS 端口 443`);
  if (forbiddenName || ipLiteral) throw new Error(`${label}必须使用公网域名，不能使用本机、IP 地址或云元数据地址`);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export async function loadProviderConfig(tenantId: string, kind: ProviderKind): Promise<StoredProviderConfig | null> {
  const runtime = getRuntime();
  let scope: "platform" | "tenant" = "platform";
  let row = await runtime.DB.prepare(`SELECT ${PROVIDER_SELECT_COLUMNS}
    FROM platform_provider_configs WHERE kind = ? AND status = 'active' LIMIT 1`)
    .bind(kind).first<ProviderConfigRow>();
  if (!row && tenantId) {
    scope = "tenant";
    row = await runtime.DB.prepare(`SELECT ${PROVIDER_SELECT_COLUMNS}
      FROM tenant_provider_configs WHERE tenant_id = ? AND kind = ? AND status = 'active' LIMIT 1`)
      .bind(tenantId, kind).first<ProviderConfigRow>();
  }
  if (!row || !runtime.CONFIG_ENCRYPTION_KEY) return null;
  let keyCiphertext = row.api_key_ciphertext; let keyIv = row.api_key_iv; let keyHint = row.api_key_hint;
  if ((!keyCiphertext || !keyIv) && row.reuse_api_key_from === "embedding") {
    const source = scope === "platform"
      ? await runtime.DB.prepare(`SELECT api_key_ciphertext, api_key_iv, api_key_hint
          FROM platform_provider_configs WHERE kind = 'embedding' AND status = 'active'`)
        .first<{ api_key_ciphertext: string | null; api_key_iv: string | null; api_key_hint: string | null }>()
      : await runtime.DB.prepare(`SELECT api_key_ciphertext, api_key_iv, api_key_hint
          FROM tenant_provider_configs WHERE tenant_id = ? AND kind = 'embedding' AND status = 'active'`)
        .bind(tenantId).first<{ api_key_ciphertext: string | null; api_key_iv: string | null; api_key_hint: string | null }>();
    keyCiphertext = source?.api_key_ciphertext ?? null; keyIv = source?.api_key_iv ?? null; keyHint = source?.api_key_hint ?? null;
  }
  if (!keyCiphertext || !keyIv) return null;
  const credentialId = row.credential_id_ciphertext && row.credential_id_iv
    ? await decryptSecret(row.credential_id_ciphertext, row.credential_id_iv, runtime.CONFIG_ENCRYPTION_KEY) : null;
  return {
    id: row.id, kind: row.kind, provider: row.provider, baseUrl: row.base_url, model: row.model,
    secondaryModel: row.secondary_model, dimensions: row.dimensions, keyHint,
    credentialId, credentialIdHint: row.credential_id_hint, region: row.region,
    reuseApiKeyFrom: row.reuse_api_key_from, candidateCount: row.candidate_count, topN: row.top_n,
    apiKey: await decryptSecret(keyCiphertext, keyIv, runtime.CONFIG_ENCRYPTION_KEY),
  };
}
