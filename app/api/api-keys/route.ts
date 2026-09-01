import { generateCustomerApiKey, hashCustomerApiKey } from "../../../lib/api-keys";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

const ALLOWED_SCOPES = new Set(["models", "chat:completions", "responses", "embeddings", "traces"]);

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request);
    const result = await getRuntime().DB.prepare(`SELECT k.id, k.name, k.key_prefix, k.assistant_id, k.scopes_json, k.rpm_limit, k.tpm_limit,
      k.expires_at, k.revoked_at, k.last_used_at, k.created_at, a.model_alias FROM customer_api_keys k
      LEFT JOIN assistants a ON a.id = k.assistant_id WHERE k.tenant_id = ? ORDER BY k.created_at DESC`).bind(context.tenantId).all();
    return Response.json({ keys: (result.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, name: row.name, prefix: row.key_prefix, assistantId: row.assistant_id, modelAlias: row.model_alias, scopes: JSON.parse(String(row.scopes_json)), rpmLimit: row.rpm_limit, tpmLimit: row.tpm_limit, expiresAt: row.expires_at, revokedAt: row.revoked_at, lastUsedAt: row.last_used_at, createdAt: row.created_at })) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const body = await request.json() as { name?: unknown; scopes?: unknown; assistantId?: unknown; rpmLimit?: unknown; tpmLimit?: unknown; expiresAt?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes.filter((item): item is string => typeof item === "string" && ALLOWED_SCOPES.has(item)))] : [...ALLOWED_SCOPES];
    const rpmLimit = Math.min(1000, Math.max(1, Math.round(Number(body.rpmLimit ?? 60)))); const tpmLimit = Math.min(2_000_000, Math.max(1000, Math.round(Number(body.tpmLimit ?? 100000))));
    if (!name || scopes.length === 0) return Response.json({ error: "密钥名称和至少一个 Scope 不能为空。" }, { status: 400 });
    const { DB } = getRuntime(); const plan = await DB.prepare(`SELECT p.api_key_limit FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ? AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1`).bind(context.tenantId).first<{ api_key_limit: number }>();
    const count = await DB.prepare("SELECT COUNT(*) AS count FROM customer_api_keys WHERE tenant_id = ? AND revoked_at IS NULL").bind(context.tenantId).first<{ count: number }>();
    if ((count?.count ?? 0) >= (plan?.api_key_limit ?? 0)) return Response.json({ error: "已达到当前套餐的 API Key 上限。" }, { status: 429 });
    let assistantId = typeof body.assistantId === "string" ? body.assistantId : null;
    if (assistantId) { const exists = await DB.prepare("SELECT id FROM assistants WHERE tenant_id = ? AND id = ? AND status = 'active'").bind(context.tenantId, assistantId).first(); if (!exists) return Response.json({ error: "助手不存在。" }, { status: 404 }); }
    else assistantId = (await DB.prepare("SELECT id FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").bind(context.tenantId).first<{ id: string }>())?.id ?? null;
    const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
    const generated = generateCustomerApiKey(); const hash = await hashCustomerApiKey(generated.fullKey); const id = crypto.randomUUID(); const now = new Date().toISOString();
    await DB.prepare(`INSERT INTO customer_api_keys
      (id, tenant_id, name, key_prefix, key_hash, assistant_id, scopes_json, rpm_limit, tpm_limit, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, context.tenantId, name, generated.prefix, hash, assistantId, JSON.stringify(scopes), rpmLimit, tpmLimit, expiresAt, now).run();
    return Response.json({ key: { id, name, value: generated.fullKey, prefix: generated.prefix, assistantId, scopes, rpmLimit, tpmLimit, expiresAt, createdAt: now }, warning: "完整密钥只显示这一次，请立即复制保存。" }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const id = new URL(request.url).searchParams.get("id"); if (!id) return Response.json({ error: "缺少 API Key ID。" }, { status: 400 });
    const result = await getRuntime().DB.prepare("UPDATE customer_api_keys SET revoked_at = ? WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL").bind(new Date().toISOString(), context.tenantId, id).run();
    if (!result.meta.changes) return Response.json({ error: "API Key 不存在或已吊销。" }, { status: 404 });
    return Response.json({ revoked: true });
  } catch (error) { return routeError(error); }
}
