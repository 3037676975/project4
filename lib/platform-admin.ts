import { getRuntime } from "./runtime";
import { readIdentity, routeError } from "./tenant";
import { sha256 } from "./security";

export type PlatformRole = "super_admin" | "operator" | "finance" | "support" | "risk";
export type PlatformContext = { id: string; accountId: string | null; email: string; displayName: string; role: PlatformRole };

function bootstrapEmails() {
  const runtime = getRuntime();
  const configured = String(runtime.PLATFORM_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (runtime.APP_ENV === "local" && runtime.LOCAL_AUTH_EMAIL) configured.push(runtime.LOCAL_AUTH_EMAIL.trim().toLowerCase());
  return new Set(configured);
}

export function isPlatformBootstrapEmail(email: string) {
  return bootstrapEmails().has(email.trim().toLowerCase());
}

async function platformAdminId(email: string) {
  return `padm_${(await sha256(email)).slice(0, 24)}`;
}

export async function ensurePlatformAdmin(email: string, displayName: string, accountId: string | null = null): Promise<PlatformContext | null> {
  const runtime = getRuntime(); const normalized = email.trim().toLowerCase(); const now = new Date().toISOString();
  let row = await runtime.DB.prepare("SELECT id, account_id, email, display_name, role, status FROM platform_admins WHERE email = ? LIMIT 1")
    .bind(normalized).first<{ id: string; account_id: string | null; email: string; display_name: string | null; role: PlatformRole; status: string }>();
  if (!row && bootstrapEmails().has(normalized)) {
    await runtime.DB.prepare(`INSERT OR IGNORE INTO platform_admins
      (id, account_id, email, display_name, role, status, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'super_admin', 'active', ?, ?, ?)`)
      .bind(await platformAdminId(normalized), accountId, normalized, displayName, now, now, now).run();
    row = await runtime.DB.prepare("SELECT id, account_id, email, display_name, role, status FROM platform_admins WHERE email = ? LIMIT 1")
      .bind(normalized).first<{ id: string; account_id: string | null; email: string; display_name: string | null; role: PlatformRole; status: string }>();
  }
  if (!row || row.status !== "active") return null;
  await runtime.DB.prepare("UPDATE platform_admins SET account_id = COALESCE(account_id, ?), display_name = ?, last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(accountId, displayName, now, now, row.id).run();
  return { id: row.id, accountId: row.account_id || accountId, email: row.email, displayName: displayName || row.display_name || row.email, role: row.role };
}

export async function requirePlatformAdmin(request: Request, allowed: PlatformRole[] = ["super_admin", "operator", "finance", "support", "risk"]) {
  const identity = await readIdentity(request);
  if (!identity) throw Object.assign(new Error("请先登录。"), { status: 401 });
  const admin = await ensurePlatformAdmin(identity.email, identity.displayName, identity.accountId);
  if (!admin || !allowed.includes(admin.role)) throw Object.assign(new Error("当前账号没有平台元后台权限。"), { status: 403 });
  return admin;
}

export async function writePlatformAudit(admin: PlatformContext, action: string, targetType: string, targetId: string | null, detail: Record<string, unknown> = {}) {
  const { DB } = getRuntime();
  await DB.prepare(`INSERT INTO platform_audit_logs
    (id, admin_id, admin_email, action, target_type, target_id, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`paudit_${crypto.randomUUID().replaceAll("-", "")}`, admin.id, admin.email, action, targetType, targetId, JSON.stringify(detail), new Date().toISOString()).run();
}

export function platformAuthSummary() {
  return { mode: "account_password", label: "KnowFlow 账号密码", passwordConfigured: true, passwordOwner: "每名管理员独立管理" };
}

export { routeError as platformRouteError };
