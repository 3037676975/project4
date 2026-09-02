import { getRuntime } from "../../../lib/runtime";
import { platformAuthSummary, platformRouteError, requirePlatformAdmin, writePlatformAudit } from "../../../lib/platform-admin";
import { sha256 } from "../../../lib/security";
import { createUserAccount, resetUserPassword } from "../../../lib/app-auth";
import { BUILTIN_MANUAL_APPLICATION_KEY, BUILTIN_MANUAL_VISIBILITY_KEY } from "../../../lib/platform-settings";

function integer(value: unknown, min: number, max: number) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

export async function GET(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request, ["super_admin"]); const { DB } = getRuntime(); const monthStart = `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`;
    const [summary, tenants, plans, admins, audits, builtinManualSetting, builtinManualApplicationSetting] = await Promise.all([
      DB.prepare(`SELECT
        (SELECT COUNT(*) FROM tenants) AS tenants,
        (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active_tenants,
        (SELECT COUNT(*) FROM tenant_members WHERE status = 'active') AS members,
        (SELECT COUNT(*) FROM billing_orders WHERE status = 'fulfilled' AND created_at >= ?) AS paid_orders,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM billing_orders WHERE status = 'fulfilled' AND created_at >= ?) AS revenue_cents,
        (SELECT COALESCE(SUM(cost_micros), 0) FROM traces WHERE created_at >= ?) AS cost_micros,
        (SELECT COUNT(*) FROM refund_requests WHERE status IN ('requested','approved','processing')) AS pending_refunds`).bind(monthStart, monthStart, monthStart).first<Record<string, number>>(),
      DB.prepare(`SELECT t.id, t.name, t.slug, t.status, t.credits_balance, t.company_name, t.billing_email, t.created_at,
        (SELECT COUNT(*) FROM tenant_members tm WHERE tm.tenant_id = t.id AND tm.status = 'active') AS member_count,
        (SELECT COUNT(*) FROM knowledge_documents kd WHERE kd.tenant_id = t.id) AS document_count,
        (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1) AS plan_name,
        (SELECT p.code FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1) AS plan_code,
        (SELECT COALESCE(SUM(o.amount_cents), 0) FROM billing_orders o WHERE o.tenant_id = t.id AND o.status = 'fulfilled') AS revenue_cents
        FROM tenants t ORDER BY t.created_at DESC LIMIT 200`).all(),
      DB.prepare(`SELECT id, code, name, monthly_price_cents, request_quota, token_quota, storage_quota_bytes, monthly_credits,
        api_key_limit, member_limit, widget_conversation_quota, lead_quota, features_json, active, created_at FROM plans ORDER BY monthly_price_cents`).all(),
      DB.prepare(`SELECT pa.id, pa.account_id, pa.email, pa.display_name, pa.role, pa.status, pa.last_login_at, pa.created_at, pa.updated_at,
        ua.must_change_password, ua.last_login_at AS account_last_login_at FROM platform_admins pa LEFT JOIN user_accounts ua ON ua.id = pa.account_id ORDER BY pa.created_at`).all(),
      DB.prepare("SELECT id, admin_email, action, target_type, target_id, detail_json, created_at FROM platform_audit_logs ORDER BY created_at DESC LIMIT 100").all(),
      DB.prepare("SELECT value, updated_by, updated_at FROM platform_settings WHERE key = ? LIMIT 1").bind(BUILTIN_MANUAL_VISIBILITY_KEY).first<{ value: string; updated_by: string | null; updated_at: string }>(),
      DB.prepare("SELECT value, updated_by, updated_at FROM platform_settings WHERE key = ? LIMIT 1").bind(BUILTIN_MANUAL_APPLICATION_KEY).first<{ value: string; updated_by: string | null; updated_at: string }>(),
    ]);
    return Response.json({ currentAdmin: admin, auth: platformAuthSummary(), summary: {
      tenants: summary?.tenants || 0, activeTenants: summary?.active_tenants || 0, members: summary?.members || 0,
      paidOrders: summary?.paid_orders || 0, revenueCents: summary?.revenue_cents || 0, costMicros: summary?.cost_micros || 0,
      pendingRefunds: summary?.pending_refunds || 0,
    }, settings: { builtinManualVisible: builtinManualSetting?.value !== "0", builtinManualUpdatedBy: builtinManualSetting?.updated_by || null, builtinManualUpdatedAt: builtinManualSetting?.updated_at || null,
      builtinManualApplied: builtinManualApplicationSetting?.value !== "0", builtinManualApplicationUpdatedBy: builtinManualApplicationSetting?.updated_by || null,
      builtinManualApplicationUpdatedAt: builtinManualApplicationSetting?.updated_at || null },
      tenants: tenants.results, plans: (plans.results as Array<Record<string, unknown>>).map((row) => ({ ...row, features: JSON.parse(String(row.features_json || "[]")) })), admins: admins.results,
      audits: (audits.results as Array<Record<string, unknown>>).map((row) => ({ ...row, detail: JSON.parse(String(row.detail_json || "{}")) })) });
  } catch (error) { return platformRouteError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const action = String(body.action || ""); const { DB } = getRuntime();
    if (action === "builtin_manual_visibility") {
      const admin = await requirePlatformAdmin(request, ["super_admin"]); const visible = body.visible !== false; const now = new Date().toISOString();
      await DB.prepare(`INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(BUILTIN_MANUAL_VISIBILITY_KEY, visible ? "1" : "0", admin.email, now).run();
      await writePlatformAudit(admin, "system_document.visibility.updated", "system_document", "builtin-ai-kb-saas-guide", { visible });
      return Response.json({ saved: true, visible });
    }
    if (action === "builtin_manual_application") {
      const admin = await requirePlatformAdmin(request, ["super_admin"]); const applied = body.applied !== false; const now = new Date().toISOString();
      await DB.prepare(`INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(BUILTIN_MANUAL_APPLICATION_KEY, applied ? "1" : "0", admin.email, now).run();
      await writePlatformAudit(admin, "system_document.application.updated", "system_document", "builtin-ai-kb-saas-guide", { applied });
      return Response.json({ saved: true, applied });
    }
    if (action === "tenant_status") {
      const admin = await requirePlatformAdmin(request, ["super_admin"]); const tenantId = String(body.tenantId || ""); const status = body.status === "suspended" ? "suspended" : "active";
      const target = await DB.prepare("SELECT id, name, status FROM tenants WHERE id = ?").bind(tenantId).first<{ id: string; name: string; status: string }>();
      if (!target) return Response.json({ error: "租户不存在。" }, { status: 404 });
      await DB.prepare("UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), tenantId).run();
      await writePlatformAudit(admin, "tenant.status.updated", "tenant", tenantId, { name: target.name, from: target.status, to: status });
      return Response.json({ saved: true, status });
    }
    if (action === "plan_update") {
      const admin = await requirePlatformAdmin(request, ["super_admin"]); const id = String(body.id || "");
      const plan = await DB.prepare("SELECT id, code FROM plans WHERE id = ?").bind(id).first<{ id: string; code: string }>();
      if (!plan) return Response.json({ error: "套餐不存在。" }, { status: 404 });
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : ""; if (!name) return Response.json({ error: "套餐名称不能为空。" }, { status: 400 });
      const storageQuotaGb = body.storageQuotaGb === undefined ? null : Number(body.storageQuotaGb);
      if (storageQuotaGb !== null && (!Number.isFinite(storageQuotaGb) || storageQuotaGb < 0.1 || storageQuotaGb > 1024)) return Response.json({ error: "存储额度请输入 0.1 到 1024 GB。" }, { status: 400 });
      const storageQuotaBytes = storageQuotaGb === null ? integer(body.storageQuotaBytes, 104_857_600, 1_099_511_627_776) : Math.round(storageQuotaGb * 1_073_741_824);
      const fields = {
        monthlyPriceCents: integer(body.monthlyPriceCents, 0, 100_000_000), requestQuota: integer(body.requestQuota, 1, 100_000_000),
        tokenQuota: integer(body.tokenQuota, 1_000, 2_000_000_000), storageQuotaBytes,
        monthlyCredits: integer(body.monthlyCredits, 0, 2_000_000_000), apiKeyLimit: integer(body.apiKeyLimit, 1, 100_000),
        memberLimit: integer(body.memberLimit, 1, 100_000), widgetConversationQuota: integer(body.widgetConversationQuota, 0, 100_000_000),
        leadQuota: integer(body.leadQuota, 0, 100_000_000), active: body.active === false ? 0 : 1,
      };
      await DB.prepare(`UPDATE plans SET name = ?, monthly_price_cents = ?, request_quota = ?, token_quota = ?, storage_quota_bytes = ?,
        monthly_credits = ?, api_key_limit = ?, member_limit = ?, widget_conversation_quota = ?, lead_quota = ?, active = ? WHERE id = ?`)
        .bind(name, fields.monthlyPriceCents, fields.requestQuota, fields.tokenQuota, fields.storageQuotaBytes, fields.monthlyCredits,
          fields.apiKeyLimit, fields.memberLimit, fields.widgetConversationQuota, fields.leadQuota, fields.active, id).run();
      await writePlatformAudit(admin, "plan.updated", "plan", id, { code: plan.code, name, ...fields });
      return Response.json({ saved: true });
    }
    if (action === "admin_add") {
      const admin = await requirePlatformAdmin(request, ["super_admin"]); const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";
      const role = body.role === "operator" || body.role === "finance" || body.role === "support" || body.role === "risk" ? body.role : "super_admin";
      const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
      const temporaryPassword = typeof body.temporaryPassword === "string" ? body.temporaryPassword : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "请输入有效管理员邮箱。" }, { status: 400 });
      if (!displayName) return Response.json({ error: "请输入管理员姓名。" }, { status: 400 });
      let account = await DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
      let accountCreated = false;
      if (!account) { account = await createUserAccount({ email, displayName, password: temporaryPassword, mustChangePassword: true }); accountCreated = true; }
      const now = new Date().toISOString(); const id = `padm_${(await sha256(email)).slice(0, 24)}`;
      await DB.prepare(`INSERT INTO platform_admins (id, account_id, email, display_name, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(email) DO UPDATE SET account_id = excluded.account_id, display_name = excluded.display_name, role = excluded.role, status = 'active', updated_at = excluded.updated_at`)
        .bind(id, account.id, email, displayName, role, now, now).run();
      await writePlatformAudit(admin, "platform_admin.granted", "platform_admin", id, { email, role, accountCreated });
      return Response.json({ saved: true, accountCreated });
    }
    if (action === "admin_password_reset") {
      const admin = await requirePlatformAdmin(request, ["super_admin"]); const id = String(body.id || "");
      const temporaryPassword = typeof body.temporaryPassword === "string" ? body.temporaryPassword : "";
      const target = await DB.prepare("SELECT id, account_id, email FROM platform_admins WHERE id = ? LIMIT 1").bind(id).first<{ id: string; account_id: string | null; email: string }>();
      if (!target?.account_id) return Response.json({ error: "管理员尚未绑定站内账号，请先重新授权。" }, { status: 409 });
      if (target.id === admin.id) return Response.json({ error: "当前账号请在账号安全页自行修改密码。" }, { status: 400 });
      await resetUserPassword(target.account_id, temporaryPassword, true);
      await writePlatformAudit(admin, "platform_admin.password.reset", "platform_admin", id, { email: target.email });
      return Response.json({ saved: true });
    }
    if (action === "admin_status") {
      const admin = await requirePlatformAdmin(request, ["super_admin"]); const id = String(body.id || ""); const status = body.status === "disabled" ? "disabled" : "active";
      if (id === admin.id && status === "disabled") return Response.json({ error: "不能禁用当前正在登录的超级管理员。" }, { status: 400 });
      const target = await DB.prepare("SELECT id, email, role, status FROM platform_admins WHERE id = ?").bind(id).first<{ id: string; email: string; role: string; status: string }>();
      if (!target) return Response.json({ error: "平台管理员不存在。" }, { status: 404 });
      if (target.role === "super_admin" && status === "disabled") {
        const count = await DB.prepare("SELECT COUNT(*) AS total FROM platform_admins WHERE role = 'super_admin' AND status = 'active'").first<{ total: number }>();
        if ((count?.total || 0) <= 1) return Response.json({ error: "至少必须保留一名有效超级管理员。" }, { status: 409 });
      }
      await DB.prepare("UPDATE platform_admins SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
      await writePlatformAudit(admin, "platform_admin.status.updated", "platform_admin", id, { email: target.email, from: target.status, to: status });
      return Response.json({ saved: true, status });
    }
    return Response.json({ error: "不支持的平台管理操作。" }, { status: 400 });
  } catch (error) { return platformRouteError(error); }
}
