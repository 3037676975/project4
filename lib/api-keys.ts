import { getRuntime } from "./runtime";

export class PublicApiError extends Error {
  constructor(public status: number, message: string, public code = "invalid_request_error") { super(message); }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function secretBytes(secret: string) {
  const binary = atob(secret); return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function generateCustomerApiKey() {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const fullKey = `sk-kb-prod_${token}`;
  return { fullKey, prefix: `${fullKey.slice(0, 20)}…${fullKey.slice(-4)}` };
}

export async function hashCustomerApiKey(value: string) {
  const secret = getRuntime().CONFIG_ENCRYPTION_KEY;
  if (!secret) throw new PublicApiError(503, "API key service is unavailable", "service_unavailable");
  const key = await crypto.subtle.importKey("raw", secretBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ApiKeyContext = {
  apiKeyId: string; tenantId: string; assistantId: string | null; scopes: string[];
  rpmLimit: number; tpmLimit: number; planCode: string; requestQuota: number; tokenQuota: number; creditsBalance: number;
};

export async function authenticateCustomerApiKey(request: Request, scope: string): Promise<ApiKeyContext> {
  const header = request.headers.get("authorization") || "";
  const value = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!value.startsWith("sk-kb-prod_")) throw new PublicApiError(401, "Invalid API key", "invalid_api_key");
  const hash = await hashCustomerApiKey(value);
  const { DB } = getRuntime();
  const row = await DB.prepare(`
    SELECT k.id, k.tenant_id, k.assistant_id, k.scopes_json, k.rpm_limit, k.tpm_limit, k.expires_at, k.revoked_at,
      t.credits_balance, p.code AS plan_code, p.request_quota, p.token_quota
    FROM customer_api_keys k JOIN tenants t ON t.id = k.tenant_id
    JOIN subscriptions s ON s.tenant_id = t.id AND s.status = 'active'
    JOIN plans p ON p.id = s.plan_id
    WHERE k.key_hash = ? AND t.status = 'active' ORDER BY s.created_at DESC LIMIT 1
  `).bind(hash).first<{
    id: string; tenant_id: string; assistant_id: string | null; scopes_json: string; rpm_limit: number; tpm_limit: number;
    expires_at: string | null; revoked_at: string | null; credits_balance: number; plan_code: string; request_quota: number; token_quota: number;
  }>();
  if (!row || row.revoked_at || (row.expires_at && new Date(row.expires_at) <= new Date())) throw new PublicApiError(401, "Invalid or expired API key", "invalid_api_key");
  const scopes = JSON.parse(row.scopes_json) as string[];
  if (!scopes.includes(scope) && !scopes.includes("*")) throw new PublicApiError(403, `API key lacks scope: ${scope}`, "insufficient_scope");
  if (row.credits_balance <= 0) throw new PublicApiError(402, "Insufficient credits", "insufficient_credits");

  const minute = new Date().toISOString().slice(0, 16);
  const bucket = await DB.prepare(`
    INSERT INTO api_rate_buckets (id, api_key_id, window_minute, request_count, token_count, updated_at)
    VALUES (?, ?, ?, 1, 0, ?) ON CONFLICT(id) DO UPDATE SET request_count = request_count + 1, updated_at = excluded.updated_at
    RETURNING request_count, token_count
  `).bind(`${row.id}:${minute}`, row.id, minute, new Date().toISOString()).first<{ request_count: number; token_count: number }>();
  if ((bucket?.request_count ?? 1) > row.rpm_limit) throw new PublicApiError(429, "Rate limit exceeded", "rate_limit_exceeded");
  if ((bucket?.token_count ?? 0) >= row.tpm_limit) throw new PublicApiError(429, "Token rate limit exceeded", "rate_limit_exceeded");

  const month = new Date().toISOString().slice(0, 7);
  const usage = await DB.prepare("SELECT request_count, token_count FROM tenant_usage_monthly WHERE id = ?").bind(`${row.tenant_id}:${month}`).first<{ request_count: number; token_count: number }>();
  if ((usage?.request_count ?? 0) >= row.request_quota || (usage?.token_count ?? 0) >= row.token_quota) throw new PublicApiError(429, "Monthly plan quota exceeded", "quota_exceeded");
  await DB.prepare("UPDATE customer_api_keys SET last_used_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
  return { apiKeyId: row.id, tenantId: row.tenant_id, assistantId: row.assistant_id, scopes, rpmLimit: row.rpm_limit, tpmLimit: row.tpm_limit, planCode: row.plan_code, requestQuota: row.request_quota, tokenQuota: row.token_quota, creditsBalance: row.credits_balance };
}

export async function consumeApiUsage(context: ApiKeyContext, promptTokens: number, completionTokens: number, requestId: string) {
  return consumeTenantUsage({ tenantId: context.tenantId, apiKeyId: context.apiKeyId, promptTokens, completionTokens, requestId });
}

export async function consumeTenantUsage(input: {
  tenantId: string; apiKeyId?: string | null; promptTokens: number; completionTokens: number; requestId: string;
}) {
  const { tenantId, apiKeyId = null, promptTokens, completionTokens, requestId } = input;
  const totalTokens = promptTokens + completionTokens;
  const credits = Math.max(1, Math.ceil(promptTokens / 1000) + Math.ceil(completionTokens / 500));
  const now = new Date().toISOString(); const month = now.slice(0, 7); const minute = now.slice(0, 16);
  const { DB } = getRuntime();
  const updated = await DB.prepare("UPDATE tenants SET credits_balance = credits_balance - ?, updated_at = ? WHERE id = ? AND credits_balance >= ? RETURNING credits_balance").bind(credits, now, tenantId, credits).first<{ credits_balance: number }>();
  if (!updated) throw new PublicApiError(402, "Insufficient credits", "insufficient_credits");
  const statements = [
    DB.prepare(`INSERT INTO tenant_usage_monthly (id, tenant_id, month, request_count, token_count, credits_used, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET request_count = request_count + 1,
      token_count = token_count + excluded.token_count, credits_used = credits_used + excluded.credits_used, updated_at = excluded.updated_at`
    ).bind(`${tenantId}:${month}`, tenantId, month, totalTokens, credits, now),
    DB.prepare("INSERT INTO credit_ledger (id, tenant_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, ?, ?, 'api_usage', ?, ?)").bind(crypto.randomUUID(), tenantId, -credits, updated.credits_balance, requestId, now),
  ];
  if (apiKeyId) statements.push(DB.prepare("UPDATE api_rate_buckets SET token_count = token_count + ?, updated_at = ? WHERE id = ?").bind(totalTokens, now, `${apiKeyId}:${minute}`));
  await DB.batch(statements);
  return { credits, balance: updated.credits_balance };
}

export function openAiErrorResponse(error: unknown) {
  const status = error instanceof PublicApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Internal server error";
  const code = error instanceof PublicApiError ? error.code : "server_error";
  return Response.json({ error: { message: status >= 500 ? "Internal server error" : message, type: code, param: null, code } }, { status });
}
