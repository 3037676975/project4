import { getRuntime } from "./runtime";
import { randomToken, sha256 } from "./security";
import { encryptSecret } from "./crypto";
import { getSessionAccount, type AccountSession } from "./app-auth";

export type TenantContext = {
  tenantId: string;
  memberId: string;
  accountId: string | null;
  tenantName: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member" | "viewer";
};

const PLAN_SEEDS = [
  ["plan_free", "free", "体验版", 0, 1000, 500000, 52428800, 10000, 2, 2, 50, 10, '["rag","openai_api","web_widget"]'],
  ["plan_growth", "growth", "成长版", 29900, 20000, 10000000, 1073741824, 200000, 10, 10, 3000, 300, '["rag","openai_api","sse","ocr","rerank","web_widget","lead_capture","handoff","commercial_dashboard"]'],
  ["plan_business", "business", "企业版", 99900, 100000, 60000000, 10737418240, 1200000, 50, 100, 20000, 3000, '["rag","openai_api","sse","ocr","rerank","audit","priority","web_widget","lead_capture","handoff","commercial_dashboard"]'],
] as const;

async function stableId(prefix: string, value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.toLowerCase()));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex.slice(0, 24)}`;
}

export async function readIdentity(request: Request) {
  const account = await getSessionAccount(request.headers);
  if (account) return { accountId: account.id, email: account.email, displayName: account.displayName };
  return null;
}

export async function ensurePlanSeeds() {
  const { DB } = getRuntime();
  const now = new Date().toISOString();
  await DB.batch(PLAN_SEEDS.map((plan) => DB.prepare(`
    INSERT OR IGNORE INTO plans
    (id, code, name, monthly_price_cents, request_quota, token_quota, storage_quota_bytes, monthly_credits, api_key_limit, member_limit, widget_conversation_quota, lead_quota, features_json, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).bind(...plan, now)));
}

async function seedLocalProviders(tenantId: string) {
  const runtime = getRuntime(); if (runtime.APP_ENV !== "local" || !runtime.CONFIG_ENCRYPTION_KEY) return;
  const specs = [
    runtime.INFINITY_API_KEY ? { kind: "embedding", provider: "infinity", baseUrl: "http://embedding:7997/v1", model: "BAAI/bge-m3", dimensions: 1024, key: runtime.INFINITY_API_KEY } : null,
    runtime.PARSER_API_KEY ? { kind: "ocr", provider: "docling", baseUrl: "http://document-parser:8001", model: "docling+rapidocr", dimensions: null, key: runtime.PARSER_API_KEY } : null,
    runtime.DEEPSEEK_API_KEY ? { kind: "generation", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", dimensions: null, key: runtime.DEEPSEEK_API_KEY } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  for (const item of specs) {
    const encrypted = await encryptSecret(item.key, runtime.CONFIG_ENCRYPTION_KEY); const now = new Date().toISOString();
    const keyHint = item.key.length > 8 ? `${item.key.slice(0, 4)}…${item.key.slice(-4)}` : "已配置";
    await runtime.DB.prepare(`INSERT OR IGNORE INTO tenant_provider_configs
      (id, tenant_id, kind, provider, base_url, model, dimensions, api_key_ciphertext, api_key_iv, api_key_hint, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
      .bind(`prov_${item.kind}_${tenantId.slice(-12)}`, tenantId, item.kind, item.provider, item.baseUrl, item.model, item.dimensions, encrypted.ciphertext, encrypted.iv, keyHint, now).run();
  }
}

export async function getOrCreateTenant(request: Request): Promise<TenantContext> {
  const identity = await readIdentity(request);
  if (!identity) throw Object.assign(new Error("请先登录账号。"), { status: 401 });
  const runtime = getRuntime();
  await ensurePlanSeeds();
  const requestedTenantId = request.headers.get("x-tenant-id")?.trim() || null;
  const identityFilter = identity.accountId ? "(tm.account_id = ? OR (tm.account_id IS NULL AND tm.email = ?))" : "tm.email = ?";
  const identityBindings = identity.accountId ? [identity.accountId, identity.email] : [identity.email];
  const existing = await runtime.DB.prepare(`
    SELECT tm.id AS member_id, tm.tenant_id, tm.role, tm.display_name, t.name AS tenant_name
    FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
    WHERE ${identityFilter} AND tm.status = 'active' AND t.status = 'active' ${requestedTenantId ? "AND tm.tenant_id = ?" : ""}
    ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1
  `).bind(...identityBindings, ...(requestedTenantId ? [requestedTenantId] : [])).first<{ member_id: string; tenant_id: string; role: TenantContext["role"]; display_name: string | null; tenant_name: string }>();
  if (existing) {
    if (identity.accountId) await runtime.DB.prepare("UPDATE tenant_members SET account_id = ?, updated_at = ? WHERE id = ? AND account_id IS NULL")
      .bind(identity.accountId, new Date().toISOString(), existing.member_id).run();
    await seedLocalProviders(existing.tenant_id);
    return { tenantId: existing.tenant_id, memberId: existing.member_id, accountId: identity.accountId, tenantName: existing.tenant_name, email: identity.email, displayName: existing.display_name || identity.displayName, role: existing.role };
  }
  if (requestedTenantId) throw Object.assign(new Error("您无权访问所选企业工作区，或成员账号已被禁用。"), { status: 403 });
  throw Object.assign(new Error("当前账号尚未加入企业工作区，请注册企业或让企业管理员创建成员账号。"), { status: 403 });
}

export async function createTenantWorkspace(input: { account: AccountSession; companyName: string }) {
  const runtime = getRuntime(); await ensurePlanSeeds();
  const companyName = input.companyName.trim().slice(0, 120);
  if (!companyName) throw Object.assign(new Error("企业名称不能为空。"), { status: 400 });
  const existingMembership = await runtime.DB.prepare("SELECT tenant_id FROM tenant_members WHERE account_id = ? OR email = ? LIMIT 1")
    .bind(input.account.id, input.account.email).first<{ tenant_id: string }>();
  if (existingMembership) return existingMembership.tenant_id;
  const tenantId = await stableId("ten", input.account.email);
  const memberId = await stableId("mem", input.account.email);
  const suffix = tenantId.slice(-6);
  const tenantName = companyName;
  const now = new Date().toISOString();
  const kbId = `kb_${tenantId.slice(4)}`;
  const assistantId = `asst_${tenantId.slice(4)}`;
  const publicId = `pub_${crypto.randomUUID().replaceAll("-", "")}`;
  await runtime.DB.batch([
    runtime.DB.prepare("INSERT OR IGNORE INTO tenants (id, name, slug, status, credits_balance, company_name, billing_email, onboarding_completed, created_at, updated_at) VALUES (?, ?, ?, 'active', 10000, ?, ?, 0, ?, ?)").bind(tenantId, tenantName, `workspace-${suffix}`, companyName, input.account.email, now, now),
    runtime.DB.prepare("INSERT OR IGNORE INTO tenant_members (id, tenant_id, account_id, email, display_name, role, status, active_knowledge_base_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'owner', 'active', ?, ?, ?)").bind(memberId, tenantId, input.account.id, input.account.email, input.account.displayName, kbId, now, now),
    runtime.DB.prepare("INSERT OR IGNORE INTO subscriptions (id, tenant_id, plan_id, status, source, starts_at, auto_renew, created_at, updated_at) VALUES (?, ?, 'plan_free', 'active', 'system', ?, 0, ?, ?)").bind(`sub_${tenantId.slice(4)}`, tenantId, now, now, now),
    runtime.DB.prepare("INSERT OR IGNORE INTO knowledge_bases (id, tenant_id, name, description, status, is_default, position, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 1, 0, ?, ?)").bind(kbId, tenantId, "默认知识库", "企业产品与客服资料", now, now),
    runtime.DB.prepare("INSERT OR IGNORE INTO knowledge_categories (id, tenant_id, knowledge_base_id, name, position, is_system, created_at, updated_at) VALUES (?, ?, ?, '未分类', 0, 1, ?, ?)").bind(`cat_default_${kbId}`, tenantId, kbId, now, now),
    runtime.DB.prepare(`INSERT OR IGNORE INTO assistants
      (id, tenant_id, knowledge_base_id, slug, name, model_alias, system_prompt, temperature_milli, top_k, status, version, public_id, brand_name, welcome_message, suggested_questions_json, created_at, updated_at)
      VALUES (?, ?, ?, 'knowledge-agent', '知识库客服', 'kb-architect-v1', ?, 200, 5, 'active', 1, ?, '企业售后助手', ?, ?, ?, ?)`
    ).bind(assistantId, tenantId, kbId, "你是企业产品与售后客服。严格依据检索到的资料回答；资料不足时明确说明并建议转人工；优先给出结论和可执行步骤，不编造价格、库存或保修承诺。", publicId, "您好，我是企业售后助手。您可以咨询产品选型、使用方法、故障处理和保修政策。", '["产品如何选型？","设备出现故障怎么办？","保修政策是什么？"]', now, now),
    runtime.DB.prepare("INSERT OR IGNORE INTO credit_ledger (id, tenant_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, 10000, 10000, 'signup_grant', ?, ?)").bind(`credit_${tenantId.slice(4)}`, tenantId, `sub_${tenantId.slice(4)}`, now),
  ]);

  // Adopt the previous single-workspace data for the first authenticated owner.
  await runtime.DB.prepare("UPDATE knowledge_documents SET tenant_id = ?, knowledge_base_id = ? WHERE tenant_id IS NULL").bind(tenantId, kbId).run();
  const legacyProvider = await runtime.DB.prepare("SELECT * FROM provider_configs WHERE id = 'deepseek'").first<Record<string, string | null>>();
  if (legacyProvider) {
    await runtime.DB.prepare(`INSERT OR IGNORE INTO tenant_provider_configs
      (id, tenant_id, kind, provider, base_url, model, api_key_ciphertext, api_key_iv, api_key_hint, status, updated_at)
      VALUES (?, ?, 'generation', 'deepseek', ?, ?, ?, ?, ?, 'active', ?)`
    ).bind(`prov_gen_${tenantId.slice(4)}`, tenantId, legacyProvider.base_url, legacyProvider.model, legacyProvider.api_key_ciphertext, legacyProvider.api_key_iv, legacyProvider.api_key_hint, legacyProvider.updated_at || now).run();
  }
  await seedLocalProviders(tenantId);
  return tenantId;
}

export async function createTenantInvitation(input: { context: TenantContext; email: string; role: TenantContext["role"]; origin: string }) {
  const { DB } = getRuntime(); const now = new Date();
  const existingMember = await DB.prepare("SELECT status FROM tenant_members WHERE tenant_id = ? AND email = ?")
    .bind(input.context.tenantId, input.email).first<{ status: string }>();
  if (existingMember?.status === "active") throw Object.assign(new Error("该邮箱已经是当前工作区成员。"), { status: 409 });
  await DB.prepare("UPDATE tenant_invitations SET status = 'revoked' WHERE tenant_id = ? AND email = ? AND status = 'pending'")
    .bind(input.context.tenantId, input.email).run();
  const token = randomToken(32); const tokenHash = await sha256(token); const id = `inv_${crypto.randomUUID().replaceAll("-", "")}`;
  const expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString();
  await DB.prepare(`INSERT INTO tenant_invitations
    (id, tenant_id, email, role, token_hash, created_by_member_id, status, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(id, input.context.tenantId, input.email, input.role, tokenHash, input.context.memberId, expiresAt, now.toISOString()).run();
  return { id, email: input.email, role: input.role, status: "pending", expiresAt, inviteUrl: `${input.origin.replace(/\/$/, "")}/invite/${token}` };
}

export function requireRole(context: TenantContext, allowed: TenantContext["role"][]) {
  if (!allowed.includes(context.role)) throw Object.assign(new Error("当前角色没有执行此操作的权限。"), { status: 403 });
}

export function routeError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : 500;
  const message = error instanceof Error ? error.message : "服务暂时不可用。";
  return Response.json({ error: status >= 500 ? "服务暂时不可用。" : message }, { status });
}
