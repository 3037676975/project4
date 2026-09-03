import { PublicApiError } from "./api-keys";
import { getRuntime } from "./runtime";
import { bytesToBase64Url, clientIp, constantTimeEqual, hmacSha256, sha256 } from "./security";

export type PublicWidgetAssistant = {
  id: string;
  tenantId: string;
  name: string;
  publicId: string;
  publicEnabled: boolean;
  brandName: string;
  welcomeMessage: string;
  themeColor: string;
  leadCaptureEnabled: boolean;
  handoffEnabled: boolean;
  handoffLabel: string;
  suggestedQuestions: string[];
  allowedDomains: string[];
  privacyNotice: string;
  privacyPolicyUrl: string;
  privacyVersion: string;
  retentionDays: number;
  planCode: string;
  requestQuota: number;
  tokenQuota: number;
  widgetConversationQuota: number;
  leadQuota: number;
  creditsBalance: number;
  features: string[];
};

function safeStringList(value: unknown, max = 6) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, max) : [];
  } catch { return []; }
}

function safeFeatures(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export async function loadPublicWidgetAssistant(publicId: string, allowDisabled = false): Promise<PublicWidgetAssistant | null> {
  if (!/^pub_[a-f0-9]{24,64}$/i.test(publicId)) return null;
  const row = await getRuntime().DB.prepare(`
    SELECT a.id, a.tenant_id, a.name, a.public_id, a.public_enabled, a.brand_name, a.welcome_message,
      a.theme_color, a.lead_capture_enabled, a.handoff_enabled, a.handoff_label, a.suggested_questions_json,
      a.allowed_domains_json, a.privacy_notice, a.privacy_policy_url, a.privacy_version, a.retention_days,
      t.credits_balance, p.code AS plan_code, p.request_quota, p.token_quota,
      p.widget_conversation_quota, p.lead_quota, p.features_json
    FROM assistants a JOIN tenants t ON t.id = a.tenant_id AND t.status = 'active'
    LEFT JOIN subscriptions s ON s.tenant_id = a.tenant_id AND s.status = 'active'
    LEFT JOIN plans p ON p.id = s.plan_id AND p.active = 1
    WHERE a.public_id = ? AND a.status = 'active'
    ORDER BY s.created_at DESC LIMIT 1
  `).bind(publicId).first<Record<string, unknown>>();
  if (!row || (!allowDisabled && !Boolean(row.public_enabled))) return null;
  return {
    id: String(row.id), tenantId: String(row.tenant_id), name: String(row.name), publicId: String(row.public_id),
    publicEnabled: Boolean(row.public_enabled), brandName: String(row.brand_name || row.name),
    welcomeMessage: String(row.welcome_message || "您好，请问有什么可以帮您？"),
    themeColor: /^#[0-9a-f]{6}$/i.test(String(row.theme_color)) ? String(row.theme_color) : "#6d4aff",
    leadCaptureEnabled: Boolean(row.lead_capture_enabled), handoffEnabled: Boolean(row.handoff_enabled),
    handoffLabel: String(row.handoff_label || "转人工服务"), suggestedQuestions: safeStringList(row.suggested_questions_json),
    allowedDomains: safeStringList(row.allowed_domains_json, 20), privacyNotice: String(row.privacy_notice || "提交即表示同意企业处理本次咨询所需的必要信息。"),
    privacyPolicyUrl: String(row.privacy_policy_url || ""), privacyVersion: String(row.privacy_version || "2026-08-01"), retentionDays: Number(row.retention_days || 180),
    planCode: String(row.plan_code || "free"), requestQuota: Number(row.request_quota || 1000),
    tokenQuota: Number(row.token_quota || 500000), widgetConversationQuota: Number(row.widget_conversation_quota || 50),
    leadQuota: Number(row.lead_quota || 10), creditsBalance: Number(row.credits_balance || 0), features: safeFeatures(row.features_json),
  };
}

export async function enforceWidgetRateLimit(request: Request, assistant: PublicWidgetAssistant, visitorId: string) {
  const ip = clientIp(request);
  const visitorHash = await sha256(`${assistant.publicId}|${ip}|${visitorId}`);
  const now = new Date().toISOString(); const minute = now.slice(0, 16); const id = `${assistant.id}:${visitorHash}:${minute}`;
  const bucket = await getRuntime().DB.prepare(`
    INSERT INTO widget_rate_buckets (id, assistant_id, visitor_hash, window_minute, request_count, updated_at)
    VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET request_count = request_count + 1, updated_at = excluded.updated_at
    RETURNING request_count
  `).bind(id, assistant.id, visitorHash, minute, now).first<{ request_count: number }>();
  if ((bucket?.request_count || 1) > 12) throw new PublicApiError(429, "提问太频繁，请稍后再试。", "rate_limit_exceeded");
}

function encodeJson(value: Record<string, unknown>) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded); return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (item) => item.charCodeAt(0)))) as Record<string, unknown>;
}

export function normalizeAllowedDomain(value: string) {
  const candidate = value.trim().toLowerCase(); if (!candidate) return null;
  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
    return url.hostname;
  } catch { return null; }
}

function domainAllowed(hostname: string, allowed: string[]) {
  const host = hostname.toLowerCase();
  return allowed.some((item) => host === item || (item.startsWith("*.") && host.endsWith(item.slice(1)) && host !== item.slice(2)));
}

export async function createEmbedToken(assistant: PublicWidgetAssistant, embedOrigin: string) {
  const secret = getRuntime().CONFIG_ENCRYPTION_KEY; if (!secret) throw new PublicApiError(503, "嵌入签名服务未配置。");
  let origin = "direct";
  if (embedOrigin !== "direct") {
    let url: URL; try { url = new URL(embedOrigin); } catch { throw new PublicApiError(403, "嵌入来源无效。"); }
    if (assistant.allowedDomains.length && !domainAllowed(url.hostname, assistant.allowedDomains)) throw new PublicApiError(403, "该网站域名不在客服白名单中。");
    origin = url.origin;
  }
  const exp = Math.floor(Date.now() / 1000) + 86400; const payload = encodeJson({ p: assistant.publicId, o: origin, e: exp });
  const signature = await hmacSha256(secret, payload); return `${payload}.${signature}`;
}

export async function verifyEmbedToken(assistant: PublicWidgetAssistant, token: string) {
  if (!assistant.allowedDomains.length && !token) return;
  const secret = getRuntime().CONFIG_ENCRYPTION_KEY; const [payload, signature] = token.split(".");
  if (!secret || !payload || !signature) throw new PublicApiError(403, "客服嵌入凭据无效，请从企业官网重新打开。");
  const expected = await hmacSha256(secret, payload);
  if (!constantTimeEqual(expected, signature)) throw new PublicApiError(403, "客服嵌入凭据无效。");
  let decoded: Record<string, unknown>; try { decoded = decodeJson(payload); } catch { throw new PublicApiError(403, "客服嵌入凭据无效。"); }
  if (decoded.p !== assistant.publicId || Number(decoded.e) <= Date.now() / 1000) throw new PublicApiError(403, "客服嵌入凭据已过期。");
  if (decoded.o !== "direct") {
    let host = ""; try { host = new URL(String(decoded.o)).hostname; } catch { /* rejected below */ }
    if (assistant.allowedDomains.length && !domainAllowed(host, assistant.allowedDomains)) throw new PublicApiError(403, "该网站域名不在客服白名单中。");
  }
}

export async function recordPrivacyConsent(input: { request: Request; assistant: PublicWidgetAssistant; visitorId: string; purpose: "lead" | "ticket" | "offline_followup"; granted: boolean }) {
  if (!input.granted) throw new PublicApiError(400, "提交前请阅读并同意隐私告知。");
  const ipHash = await sha256(`${input.assistant.publicId}|${clientIp(input.request)}`);
  const visitorHash = await sha256(`${input.assistant.publicId}|${input.visitorId}`);
  const userAgentHash = await sha256(input.request.headers.get("user-agent") || "unknown");
  await getRuntime().DB.prepare(`INSERT INTO privacy_consents
    (id, tenant_id, assistant_id, visitor_hash, purpose, privacy_version, granted, ip_hash, user_agent_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
    .bind(`consent_${crypto.randomUUID().replaceAll("-", "")}`, input.assistant.tenantId, input.assistant.id, visitorHash, input.purpose,
      input.assistant.privacyVersion, ipHash, userAgentHash, new Date().toISOString()).run();
  return visitorHash;
}

export async function enforceWidgetQuota(assistant: PublicWidgetAssistant, creatingConversation: boolean) {
  if (!assistant.features.includes("web_widget")) throw new PublicApiError(403, "当前套餐未开通网页客服。", "feature_not_available");
  if (assistant.creditsBalance <= 0) throw new PublicApiError(402, "客服额度已用完，请联系企业管理员。", "insufficient_credits");
  const month = new Date().toISOString().slice(0, 7);
  const [usage, conversations] = await Promise.all([
    getRuntime().DB.prepare("SELECT request_count, token_count FROM tenant_usage_monthly WHERE id = ?").bind(`${assistant.tenantId}:${month}`).first<{ request_count: number; token_count: number }>(),
    creatingConversation ? getRuntime().DB.prepare("SELECT COUNT(*) AS count FROM customer_conversations WHERE tenant_id = ? AND started_at >= ?").bind(assistant.tenantId, `${month}-01T00:00:00.000Z`).first<{ count: number }>() : Promise.resolve({ count: 0 }),
  ]);
  if ((usage?.request_count || 0) >= assistant.requestQuota || (usage?.token_count || 0) >= assistant.tokenQuota) throw new PublicApiError(429, "本月客服套餐额度已用完。", "quota_exceeded");
  if (creatingConversation && (conversations?.count || 0) >= assistant.widgetConversationQuota) throw new PublicApiError(429, "本月网页客服会话额度已用完。", "widget_quota_exceeded");
}

export function publicWidgetError(error: unknown) {
  const status = error instanceof PublicApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "服务暂时不可用。";
  return Response.json({ error: status >= 500 ? "智能客服暂时繁忙，请稍后再试。" : message }, { status });
}
