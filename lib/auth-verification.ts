import type { LoginPortal } from "./app-auth";
import { loadMailSettings, sendVerificationCode } from "./mail";
import { getRuntime } from "./runtime";
import { clientIp, constantTimeEqual, hmacSha256, randomToken, sha256 } from "./security";

export type VerificationPurpose = "register" | "login";

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function verificationSecret() {
  const value = getRuntime().CONFIG_ENCRYPTION_KEY;
  if (!value) throw statusError("站点验证密钥尚未初始化。", 503);
  return value;
}

export function validVerificationPurpose(value: unknown): VerificationPurpose {
  return value === "login" ? "login" : "register";
}

export function sliderPositionMatches(target: number, position: number, tolerance = 4) {
  return Number.isFinite(position) && Math.abs(target - position) <= tolerance;
}

export function numericCode(length: number) {
  const digits = Math.max(4, Math.min(8, Math.round(length)));
  const values = crypto.getRandomValues(new Uint32Array(digits));
  return [...values].map((value) => String(value % 10)).join("");
}

function normalizePortal(purpose: VerificationPurpose, portal: LoginPortal) {
  return purpose === "register" ? "workspace" : portal === "auto" ? "workspace" : portal;
}

export async function createSliderChallenge(request: Request, purpose: VerificationPurpose, portal: LoginPortal) {
  const { DB } = getRuntime(); const now = new Date(); const ipHash = await sha256(clientIp(request));
  const recent = await DB.prepare("SELECT COUNT(*) AS total FROM auth_slider_challenges WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, new Date(now.getTime() - 10 * 60_000).toISOString()).first<{ total: number }>();
  if (Number(recent?.total || 0) >= 30) throw statusError("滑块请求过于频繁，请稍后再试。", 429);
  const random = crypto.getRandomValues(new Uint32Array(1))[0]; const targetPosition = 58 + (random % 31);
  const id = `slc_${randomToken(24)}`; const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  await DB.batch([
    DB.prepare(`INSERT INTO auth_slider_challenges
      (id, purpose, portal, target_position, attempts, expires_at, ip_hash, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`)
      .bind(id, purpose, normalizePortal(purpose, portal), targetPosition, expiresAt, ipHash, now.toISOString()),
    DB.prepare("DELETE FROM auth_slider_challenges WHERE expires_at < ?").bind(new Date(now.getTime() - 24 * 60 * 60_000).toISOString()),
  ]);
  return { challengeId: id, targetPosition, expiresAt };
}

export async function verifySliderChallenge(request: Request, challengeId: string, position: number) {
  const { DB } = getRuntime(); const now = new Date(); const ipHash = await sha256(clientIp(request));
  const row = await DB.prepare(`SELECT id, target_position, attempts, expires_at, verified_at, consumed_at, ip_hash
    FROM auth_slider_challenges WHERE id = ? LIMIT 1`).bind(challengeId).first<{
      id: string; target_position: number; attempts: number; expires_at: string; verified_at: string | null; consumed_at: string | null; ip_hash: string;
    }>();
  if (!row || row.consumed_at || new Date(row.expires_at) <= now || !constantTimeEqual(row.ip_hash, ipHash)) throw statusError("滑块验证已失效，请刷新后重试。", 410);
  if (row.attempts >= 5) throw statusError("滑块尝试次数过多，请刷新后重试。", 429);
  if (!sliderPositionMatches(row.target_position, position)) {
    await DB.prepare("UPDATE auth_slider_challenges SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    throw statusError("没有对准缺口，请再试一次。", 400);
  }
  const ticket = randomToken(32); const verifiedAt = now.toISOString();
  await DB.prepare("UPDATE auth_slider_challenges SET ticket_hash = ?, verified_at = ? WHERE id = ? AND consumed_at IS NULL")
    .bind(await sha256(ticket), verifiedAt, row.id).run();
  return { challengeId: row.id, sliderTicket: ticket, verifiedAt };
}

export async function consumeSliderTicket(request: Request, input: {
  challengeId: string; sliderTicket: string; purpose: VerificationPurpose; portal: LoginPortal;
}) {
  const { DB } = getRuntime(); const now = new Date(); const ipHash = await sha256(clientIp(request));
  const row = await DB.prepare(`SELECT id, purpose, portal, ticket_hash, expires_at, verified_at, consumed_at, ip_hash
    FROM auth_slider_challenges WHERE id = ? LIMIT 1`).bind(input.challengeId).first<{
      id: string; purpose: string; portal: string; ticket_hash: string | null; expires_at: string; verified_at: string | null; consumed_at: string | null; ip_hash: string;
    }>();
  const expectedPortal = normalizePortal(input.purpose, input.portal);
  if (!row || row.purpose !== input.purpose || row.portal !== expectedPortal || !row.ticket_hash || !row.verified_at || row.consumed_at
      || new Date(row.expires_at) <= now || !constantTimeEqual(row.ip_hash, ipHash)
      || !constantTimeEqual(row.ticket_hash, await sha256(input.sliderTicket))) throw statusError("请先完成滑块验证。", 403);
  const result = await DB.prepare("UPDATE auth_slider_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
    .bind(now.toISOString(), row.id).run();
  if (!result.meta.changes) throw statusError("滑块验证已使用，请重新验证。", 409);
}

async function codeDigest(id: string, code: string) {
  return hmacSha256(verificationSecret(), `${id}:${code}`);
}

export async function issueEmailCode(request: Request, input: {
  email: string; purpose: VerificationPurpose; portal: LoginPortal; challengeId: string; sliderTicket: string;
}) {
  await consumeSliderTicket(request, input);
  const settings = await loadMailSettings();
  if (!settings.enabled) throw statusError("邮件验证码尚未启用，请联系超级管理员。", 503);
  const { DB } = getRuntime(); const now = new Date(); const portal = normalizePortal(input.purpose, input.portal);
  const recent = await DB.prepare(`SELECT created_at FROM email_verification_codes
    WHERE email = ? AND purpose = ? AND portal = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(input.email, input.purpose, portal).first<{ created_at: string }>();
  if (recent) {
    const remaining = settings.resendSeconds - Math.floor((now.getTime() - new Date(recent.created_at).getTime()) / 1000);
    if (remaining > 0) throw statusError(`请 ${remaining} 秒后再发送验证码。`, 429);
  }
  const ipHash = await sha256(clientIp(request));
  const hourly = await DB.prepare("SELECT COUNT(*) AS total FROM email_verification_codes WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, new Date(now.getTime() - 60 * 60_000).toISOString()).first<{ total: number }>();
  if (Number(hourly?.total || 0) >= 12) throw statusError("验证码发送过于频繁，请一小时后再试。", 429);
  const id = `emc_${randomToken(24)}`; const code = numericCode(settings.codeLength);
  const expiresAt = new Date(now.getTime() + settings.codeExpiryMinutes * 60_000).toISOString();
  await DB.prepare(`INSERT INTO email_verification_codes
    (id, email, purpose, portal, code_hash, attempts, max_attempts, expires_at, ip_hash, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`)
    .bind(id, input.email, input.purpose, portal, await codeDigest(id, code), settings.maxAttempts, expiresAt, ipHash, now.toISOString()).run();
  try { await sendVerificationCode(input.email, code, input.purpose, settings.codeExpiryMinutes); }
  catch (error) { await DB.prepare("DELETE FROM email_verification_codes WHERE id = ?").bind(id).run(); throw error; }
  return { sent: true, expiresInSeconds: settings.codeExpiryMinutes * 60, resendSeconds: settings.resendSeconds };
}

export async function consumeEmailCode(input: { email: string; purpose: VerificationPurpose; portal: LoginPortal; code: string }) {
  const { DB } = getRuntime(); const portal = normalizePortal(input.purpose, input.portal); const now = new Date();
  const row = await DB.prepare(`SELECT id, code_hash, attempts, max_attempts, expires_at, consumed_at
    FROM email_verification_codes WHERE email = ? AND purpose = ? AND portal = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(input.email, input.purpose, portal).first<{ id: string; code_hash: string; attempts: number; max_attempts: number; expires_at: string; consumed_at: string | null }>();
  if (!row || row.consumed_at) throw statusError("验证码不存在或已经使用。", 400);
  if (new Date(row.expires_at) <= now) throw statusError("验证码已过期，请重新发送。", 410);
  if (row.attempts >= row.max_attempts) throw statusError("验证码尝试次数已用完，请重新发送。", 429);
  const valid = constantTimeEqual(row.code_hash, await codeDigest(row.id, input.code.trim()));
  if (!valid) {
    await DB.prepare("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    throw statusError(`验证码不正确，还可尝试 ${Math.max(0, row.max_attempts - row.attempts - 1)} 次。`, 400);
  }
  const result = await DB.prepare("UPDATE email_verification_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
    .bind(now.toISOString(), row.id).run();
  if (!result.meta.changes) throw statusError("验证码已经使用。", 409);
  return true;
}
