import { getRuntime } from "./runtime";
import { bytesToBase64Url, clientIp, constantTimeEqual, randomToken, sha256 } from "./security";

export const APP_SESSION_COOKIE = "knowflow_session";
// Cloudflare Workers rejects PBKDF2 calls above 100,000 iterations. Use the
// platform maximum together with a unique salt, strong-password policy,
// account lockout and request rate limiting.
export const PASSWORD_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

type HeaderReader = { get(name: string): string | null };

export type AccountSession = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
};

export type AccountAccess = {
  platformRole: "super_admin" | "operator" | "finance" | "support" | "risk" | null;
  tenantCount: number;
  destination: "/platform" | "/admin" | "/workspace" | "/account" | "/login";
};

export type LoginPortal = "auto" | "platform" | "admin" | "workspace";

export function validLoginPortal(value: unknown): LoginPortal {
  return value === "platform" || value === "admin" || value === "workspace" ? value : "auto";
}

export function portalDestination(access: AccountAccess, portal: LoginPortal) {
  if (access.destination === "/account") return "/account" as const;
  if (portal === "auto") return access.destination === "/login" ? null : access.destination;
  if (portal === "platform") return access.platformRole === "super_admin" ? "/platform" as const : null;
  if (portal === "admin") return access.platformRole ? "/admin" as const : null;
  return access.tenantCount > 0 || access.platformRole === "super_admin" ? "/workspace" as const : null;
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function cookieValue(headers: HeaderReader, name: string) {
  for (const pair of (headers.get("cookie") || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(pair.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function passwordPolicyError(password: string) {
  if (password.length < 10) return "密码至少需要 10 位。";
  if (password.length > 128) return "密码不能超过 128 位。";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "密码必须同时包含字母和数字。";
  return null;
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derivePassword(password, salt, iterations), salt: bytesToBase64Url(salt), iterations };
}

export async function verifyPassword(password: string, hash: string, salt: string, iterations: number) {
  try { return constantTimeEqual(await derivePassword(password, base64UrlToBytes(salt), iterations), hash); }
  catch { return false; }
}

export async function createUserAccount(input: { email: string; displayName: string; password: string; mustChangePassword?: boolean; verified?: boolean }) {
  const email = normalizeEmail(input.email); const displayName = input.displayName.trim().slice(0, 80);
  if (!validateEmail(email)) throw Object.assign(new Error("请输入有效邮箱。"), { status: 400 });
  if (!displayName) throw Object.assign(new Error("姓名不能为空。"), { status: 400 });
  const policyError = passwordPolicyError(input.password); if (policyError) throw Object.assign(new Error(policyError), { status: 400 });
  const existing = await getRuntime().DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (existing) throw Object.assign(new Error("该邮箱已经创建账号，请直接登录。"), { status: 409 });
  const password = await hashPassword(input.password); const now = new Date().toISOString(); const id = `usr_${crypto.randomUUID().replaceAll("-", "")}`;
  await getRuntime().DB.prepare(`INSERT INTO user_accounts
    (id, email, display_name, password_hash, password_salt, password_iterations, status, email_verified_at,
      must_change_password, failed_login_count, password_changed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?, ?)`)
    .bind(id, email, displayName, password.hash, password.salt, password.iterations, input.verified === false ? null : now,
      input.mustChangePassword ? 1 : 0, now, now, now).run();
  return { id, email, displayName, status: "active", mustChangePassword: Boolean(input.mustChangePassword) } satisfies AccountSession;
}

export async function resetUserPassword(accountId: string, password: string, mustChangePassword: boolean) {
  const policyError = passwordPolicyError(password); if (policyError) throw Object.assign(new Error(policyError), { status: 400 });
  const next = await hashPassword(password); const now = new Date().toISOString();
  const result = await getRuntime().DB.prepare(`UPDATE user_accounts SET password_hash = ?, password_salt = ?, password_iterations = ?,
    must_change_password = ?, failed_login_count = 0, locked_until = NULL, password_changed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(next.hash, next.salt, next.iterations, mustChangePassword ? 1 : 0, now, now, accountId).run();
  if (!result.meta.changes) throw Object.assign(new Error("账号不存在。"), { status: 404 });
  await getRuntime().DB.prepare("UPDATE user_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL")
    .bind(now, accountId).run();
}

export async function authenticateUser(emailValue: string, password: string) {
  const email = normalizeEmail(emailValue); const { DB } = getRuntime(); const now = new Date();
  const row = await DB.prepare(`SELECT id, email, display_name, password_hash, password_salt, password_iterations,
    status, must_change_password, failed_login_count, locked_until FROM user_accounts WHERE email = ? LIMIT 1`)
    .bind(email).first<{ id: string; email: string; display_name: string; password_hash: string; password_salt: string; password_iterations: number;
      status: string; must_change_password: number; failed_login_count: number; locked_until: string | null }>();
  if (!row) return null;
  if (row.status !== "active") throw Object.assign(new Error("账号已被禁用，请联系管理员。"), { status: 403 });
  if (row.locked_until && new Date(row.locked_until) > now) throw Object.assign(new Error("登录失败次数过多，请 15 分钟后再试。"), { status: 423 });
  const valid = await verifyPassword(password, row.password_hash, row.password_salt, row.password_iterations);
  if (!valid) {
    const failures = Number(row.failed_login_count || 0) + 1; const lockedUntil = failures >= 8 ? new Date(now.getTime() + 15 * 60_000).toISOString() : null;
    await DB.prepare("UPDATE user_accounts SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?")
      .bind(failures >= 8 ? 0 : failures, lockedUntil, now.toISOString(), row.id).run();
    return null;
  }
  await DB.prepare("UPDATE user_accounts SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now.toISOString(), now.toISOString(), row.id).run();
  return { id: row.id, email: row.email, displayName: row.display_name, status: row.status, mustChangePassword: Boolean(row.must_change_password) } satisfies AccountSession;
}

export async function getActiveAccountByEmail(emailValue: string, includeInactive = false): Promise<AccountSession | null> {
  const email = normalizeEmail(emailValue);
  const row = await getRuntime().DB.prepare(`SELECT id, email, display_name, status, must_change_password
    FROM user_accounts WHERE email = ? LIMIT 1`).bind(email).first<{
      id: string; email: string; display_name: string; status: string; must_change_password: number;
    }>();
  if (!row) return null;
  if (row.status !== "active" && !includeInactive) throw Object.assign(new Error("账号已被禁用，请联系管理员。"), { status: 403 });
  return { id: row.id, email: row.email, displayName: row.display_name, status: row.status, mustChangePassword: Boolean(row.must_change_password) };
}

export async function recordSuccessfulLogin(accountId: string) {
  const now = new Date().toISOString();
  await getRuntime().DB.prepare(`UPDATE user_accounts SET failed_login_count = 0, locked_until = NULL,
    last_login_at = ?, updated_at = ? WHERE id = ? AND status = 'active'`).bind(now, now, accountId).run();
}

export async function issueSession(request: Request, accountId: string) {
  const token = randomToken(32); const tokenHash = await sha256(token); const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const ipHash = await sha256(clientIp(request)); const userAgentHash = await sha256(request.headers.get("user-agent") || "unknown");
  const { DB } = getRuntime();
  await DB.batch([
    DB.prepare(`INSERT INTO user_sessions (id, account_id, token_hash, expires_at, ip_hash, user_agent_hash, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(`ses_${crypto.randomUUID().replaceAll("-", "")}`, accountId, tokenHash, expiresAt, ipHash, userAgentHash, now.toISOString(), now.toISOString()),
    DB.prepare("UPDATE user_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL AND expires_at <= ?").bind(now.toISOString(), accountId, now.toISOString()),
  ]);
  return appSessionCookie(token);
}

export async function getSessionAccount(headers: HeaderReader): Promise<AccountSession | null> {
  const token = cookieValue(headers, APP_SESSION_COOKIE); if (!token) return null;
  const tokenHash = await sha256(token); const now = new Date().toISOString();
  const row = await getRuntime().DB.prepare(`SELECT a.id, a.email, a.display_name, a.status, a.must_change_password
    FROM user_sessions s JOIN user_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND a.status = 'active' LIMIT 1`)
    .bind(tokenHash, now).first<{ id: string; email: string; display_name: string; status: string; must_change_password: number }>();
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, status: row.status, mustChangePassword: Boolean(row.must_change_password) };
}

export async function revokeCurrentSession(headers: HeaderReader) {
  const token = cookieValue(headers, APP_SESSION_COOKIE); if (!token) return;
  await getRuntime().DB.prepare("UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), await sha256(token)).run();
}

export function appSessionCookie(token: string) {
  const secure = getRuntime().APP_ENV === "local" ? "" : "; Secure";
  return `${APP_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function expiredAppSessionCookie() {
  const secure = getRuntime().APP_ENV === "local" ? "" : "; Secure";
  return `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function accountAccess(account: AccountSession): Promise<AccountAccess> {
  if (account.mustChangePassword) return { platformRole: null, tenantCount: 0, destination: "/account" };
  const { DB } = getRuntime();
  const [platform, tenants] = await Promise.all([
    DB.prepare("SELECT role FROM platform_admins WHERE (account_id = ? OR (account_id IS NULL AND email = ?)) AND status = 'active' LIMIT 1")
      .bind(account.id, account.email).first<{ role: AccountAccess["platformRole"] }>(),
    DB.prepare(`SELECT COUNT(*) AS total FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
      WHERE (tm.account_id = ? OR (tm.account_id IS NULL AND tm.email = ?)) AND tm.status = 'active' AND t.status = 'active'`)
      .bind(account.id, account.email).first<{ total: number }>(),
  ]);
  const platformRole = platform?.role || null; const tenantCount = Number(tenants?.total || 0);
  const destination = platformRole === "super_admin" ? "/platform" : platformRole ? "/admin" : tenantCount ? "/workspace" : "/login";
  return { platformRole, tenantCount, destination };
}

export async function attachAccountByEmail(account: AccountSession) {
  const { DB } = getRuntime(); const now = new Date().toISOString();
  await DB.batch([
    DB.prepare("UPDATE tenant_members SET account_id = ?, display_name = COALESCE(display_name, ?), updated_at = ? WHERE email = ? AND account_id IS NULL")
      .bind(account.id, account.displayName, now, account.email),
    DB.prepare("UPDATE platform_admins SET account_id = ?, display_name = COALESCE(display_name, ?), updated_at = ? WHERE email = ? AND account_id IS NULL")
      .bind(account.id, account.displayName, now, account.email),
  ]);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw Object.assign(new Error("请求来源校验失败。"), { status: 403 });
}

export function authRouteError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : 500;
  const message = error instanceof Error ? error.message : "认证服务暂时不可用。";
  if (status >= 500) console.error("[knowflow-auth] request failed", error);
  return Response.json({ error: status >= 500 ? "认证服务暂时不可用。" : message }, { status });
}
