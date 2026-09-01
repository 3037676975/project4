import { decryptSecret, encryptSecret } from "./crypto";
import { getRuntime } from "./runtime";

export type MailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  useSsl: boolean;
  useStarttls: boolean;
  relayUrl: string;
  relayToken: string;
  codeExpiryMinutes: number;
  resendSeconds: number;
  maxAttempts: number;
  codeLength: number;
  orderNotifications: boolean;
  source: "database" | "environment" | "default";
};

type MailRow = {
  enabled: number; host: string; port: number; username: string; password_ciphertext: string | null; password_iv: string | null;
  password_hint: string | null; from_email: string; from_name: string; use_ssl: number; use_starttls: number; relay_url: string;
  relay_token_ciphertext: string | null; relay_token_iv: string | null; relay_token_hint: string | null;
  code_expiry_minutes: number; resend_seconds: number; max_attempts: number; code_length: number; order_notifications: number;
  updated_at: string;
};

function bool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

function integer(value: string | number | undefined, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function secretHint(value: string) {
  if (!value) return null;
  return value.length <= 8 ? `${value.slice(0, 2)}••••` : `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

function environmentSettings(): MailSettings {
  const runtime = getRuntime();
  const username = String(runtime.SMTP_USERNAME || "").trim();
  return {
    enabled: bool(runtime.SMTP_ENABLED, Boolean(username && runtime.SMTP_PASSWORD)),
    host: String(runtime.SMTP_HOST || "smtp.qq.com").trim(),
    port: integer(runtime.SMTP_PORT, 465, 1, 65535),
    username,
    password: String(runtime.SMTP_PASSWORD || ""),
    fromEmail: String(runtime.SMTP_FROM_EMAIL || username).trim(),
    fromName: String(runtime.SMTP_FROM_NAME || "KnowFlow").trim(),
    useSsl: bool(runtime.SMTP_USE_SSL, true),
    useStarttls: bool(runtime.SMTP_USE_STARTTLS, false),
    relayUrl: String(runtime.MAIL_RELAY_URL || (runtime.APP_ENV === "local" ? "http://email-relay:8025/send" : "")).trim(),
    relayToken: String(runtime.MAIL_RELAY_TOKEN || ""),
    codeExpiryMinutes: integer(runtime.EMAIL_CODE_EXPIRY_MINUTES, 10, 1, 30),
    resendSeconds: integer(runtime.EMAIL_CODE_RESEND_SECONDS, 60, 30, 600),
    maxAttempts: integer(runtime.EMAIL_CODE_MAX_ATTEMPTS, 5, 1, 10),
    codeLength: integer(runtime.EMAIL_CODE_LENGTH, 6, 4, 8),
    orderNotifications: true,
    source: username || runtime.SMTP_PASSWORD ? "environment" : "default",
  };
}

async function decryptOptional(ciphertext: string | null, iv: string | null) {
  const key = getRuntime().CONFIG_ENCRYPTION_KEY;
  if (!ciphertext || !iv || !key) return "";
  return decryptSecret(ciphertext, iv, key);
}

export async function loadMailSettings(): Promise<MailSettings> {
  const fallback = environmentSettings();
  const row = await getRuntime().DB.prepare(`SELECT enabled, host, port, username, password_ciphertext, password_iv, password_hint,
    from_email, from_name, use_ssl, use_starttls, relay_url, relay_token_ciphertext, relay_token_iv, relay_token_hint,
    code_expiry_minutes, resend_seconds, max_attempts, code_length, order_notifications, updated_at
    FROM platform_mail_configs WHERE id = 'primary' LIMIT 1`).first<MailRow>();
  if (!row) return fallback;
  const [storedPassword, storedRelayToken] = await Promise.all([
    decryptOptional(row.password_ciphertext, row.password_iv),
    decryptOptional(row.relay_token_ciphertext, row.relay_token_iv),
  ]);
  return {
    enabled: Boolean(row.enabled), host: row.host, port: row.port, username: row.username,
    password: storedPassword || fallback.password, fromEmail: row.from_email, fromName: row.from_name,
    useSsl: Boolean(row.use_ssl), useStarttls: Boolean(row.use_starttls), relayUrl: row.relay_url || fallback.relayUrl,
    relayToken: storedRelayToken || fallback.relayToken, codeExpiryMinutes: row.code_expiry_minutes,
    resendSeconds: row.resend_seconds, maxAttempts: row.max_attempts, codeLength: row.code_length,
    orderNotifications: Boolean(row.order_notifications), source: "database",
  };
}

export async function publicMailSettings() {
  const settings = await loadMailSettings();
  const row = await getRuntime().DB.prepare(`SELECT password_hint, relay_token_hint, updated_at
    FROM platform_mail_configs WHERE id = 'primary' LIMIT 1`).first<{ password_hint: string | null; relay_token_hint: string | null; updated_at: string | null }>();
  return {
    enabled: settings.enabled, host: settings.host, port: settings.port, username: settings.username,
    passwordConfigured: Boolean(settings.password), passwordHint: row?.password_hint || secretHint(settings.password),
    fromEmail: settings.fromEmail, fromName: settings.fromName, useSsl: settings.useSsl, useStarttls: settings.useStarttls,
    relayUrl: settings.relayUrl, relayTokenConfigured: Boolean(settings.relayToken), relayTokenHint: row?.relay_token_hint || secretHint(settings.relayToken),
    relayReady: Boolean(settings.relayUrl && settings.relayToken), directSmtpReady: Boolean(settings.password && settings.host && settings.port !== 25),
    deliveryReady: Boolean(settings.password && settings.host && (settings.relayUrl && settings.relayToken || settings.port !== 25)),
    deliveryMode: settings.relayUrl && settings.relayToken ? "https_relay" : "direct_smtp",
    codeExpiryMinutes: settings.codeExpiryMinutes,
    resendSeconds: settings.resendSeconds, maxAttempts: settings.maxAttempts, codeLength: settings.codeLength,
    orderNotifications: settings.orderNotifications, source: settings.source, updatedAt: row?.updated_at || null,
  };
}

function normalizeRelayUrl(value: string) {
  const trimmed = value.trim(); if (!trimmed) return "";
  const url = new URL(trimmed); const runtime = getRuntime();
  const local = runtime.APP_ENV === "local" && ["http:", "https:"].includes(url.protocol);
  if (!local && url.protocol !== "https:") throw Object.assign(new Error("线上邮件中继必须使用 HTTPS 地址。"), { status: 400 });
  if (url.username || url.password || url.hash) throw Object.assign(new Error("邮件中继地址不能包含账号、密码或锚点。"), { status: 400 });
  return url.toString();
}

export async function saveMailSettings(input: Record<string, unknown>, adminId: string) {
  const runtime = getRuntime();
  if (!runtime.CONFIG_ENCRYPTION_KEY) throw Object.assign(new Error("站点加密密钥尚未初始化。"), { status: 503 });
  const current = await runtime.DB.prepare(`SELECT password_ciphertext, password_iv, password_hint,
    relay_token_ciphertext, relay_token_iv, relay_token_hint FROM platform_mail_configs WHERE id = 'primary' LIMIT 1`)
    .first<{ password_ciphertext: string | null; password_iv: string | null; password_hint: string | null; relay_token_ciphertext: string | null; relay_token_iv: string | null; relay_token_hint: string | null }>();
  const fallback = environmentSettings();
  const host = String(input.host || "smtp.qq.com").trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(host) || host.startsWith(".") || host.endsWith(".")) throw Object.assign(new Error("SMTP 主机格式不正确。"), { status: 400 });
  const port = integer(input.port as number, 465, 1, 65535);
  if (port === 25) throw Object.assign(new Error("托管站点禁止 SMTP 25 端口，请使用 SSL 465 或 STARTTLS 587。"), { status: 400 });
  const username = String(input.username || "").trim(); const fromEmail = String(input.fromEmail || username).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw Object.assign(new Error("SMTP 用户名和发件邮箱必须是有效邮箱。"), { status: 400 });
  const fromName = String(input.fromName || "KnowFlow").trim().slice(0, 80); if (!fromName) throw Object.assign(new Error("发件人名称不能为空。"), { status: 400 });
  const useSsl = input.useSsl !== false; const useStarttls = input.useStarttls === true;
  if (useSsl && useStarttls) throw Object.assign(new Error("SSL 与 STARTTLS 只能启用一种。"), { status: 400 });
  const relayUrl = normalizeRelayUrl(String(input.relayUrl || ""));
  let passwordCiphertext = current?.password_ciphertext ?? null; let passwordIv = current?.password_iv ?? null; let passwordHint = current?.password_hint ?? null;
  const password = typeof input.password === "string" ? input.password.trim() : "";
  if (password) { const encrypted = await encryptSecret(password, runtime.CONFIG_ENCRYPTION_KEY); passwordCiphertext = encrypted.ciphertext; passwordIv = encrypted.iv; passwordHint = secretHint(password); }
  if (!passwordCiphertext && !fallback.password) throw Object.assign(new Error("请填写 SMTP 授权码。"), { status: 400 });
  let relayTokenCiphertext = current?.relay_token_ciphertext ?? null; let relayTokenIv = current?.relay_token_iv ?? null; let relayTokenHint = current?.relay_token_hint ?? null;
  const relayToken = typeof input.relayToken === "string" ? input.relayToken.trim() : "";
  if (relayToken) { const encrypted = await encryptSecret(relayToken, runtime.CONFIG_ENCRYPTION_KEY); relayTokenCiphertext = encrypted.ciphertext; relayTokenIv = encrypted.iv; relayTokenHint = secretHint(relayToken); }
  const now = new Date().toISOString();
  await runtime.DB.prepare(`INSERT INTO platform_mail_configs
    (id, enabled, host, port, username, password_ciphertext, password_iv, password_hint, from_email, from_name,
     use_ssl, use_starttls, relay_url, relay_token_ciphertext, relay_token_iv, relay_token_hint, code_expiry_minutes,
     resend_seconds, max_attempts, code_length, order_notifications, updated_by_admin_id, created_at, updated_at)
    VALUES ('primary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, host = excluded.host, port = excluded.port, username = excluded.username,
      password_ciphertext = excluded.password_ciphertext, password_iv = excluded.password_iv, password_hint = excluded.password_hint,
      from_email = excluded.from_email, from_name = excluded.from_name, use_ssl = excluded.use_ssl, use_starttls = excluded.use_starttls,
      relay_url = excluded.relay_url, relay_token_ciphertext = excluded.relay_token_ciphertext, relay_token_iv = excluded.relay_token_iv,
      relay_token_hint = excluded.relay_token_hint, code_expiry_minutes = excluded.code_expiry_minutes, resend_seconds = excluded.resend_seconds,
      max_attempts = excluded.max_attempts, code_length = excluded.code_length, order_notifications = excluded.order_notifications,
      updated_by_admin_id = excluded.updated_by_admin_id, updated_at = excluded.updated_at`)
    .bind(input.enabled === false ? 0 : 1, host, port, username, passwordCiphertext, passwordIv, passwordHint, fromEmail, fromName,
      useSsl ? 1 : 0, useStarttls ? 1 : 0, relayUrl, relayTokenCiphertext, relayTokenIv, relayTokenHint,
      integer(input.codeExpiryMinutes as number, 10, 1, 30), integer(input.resendSeconds as number, 60, 30, 600),
      integer(input.maxAttempts as number, 5, 1, 10), integer(input.codeLength as number, 6, 4, 8), input.orderNotifications === false ? 0 : 1,
      adminId, now, now).run();
  return publicMailSettings();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export async function sendMail(input: { to: string; subject: string; text: string; html?: string }) {
  const settings = await loadMailSettings();
  if (!settings.enabled) throw Object.assign(new Error("邮件发送尚未启用，请联系超级管理员。"), { status: 503 });
  if (!settings.password) throw Object.assign(new Error("SMTP 授权码尚未配置。"), { status: 503 });
  if (settings.relayUrl && settings.relayToken) {
    const response = await fetch(settings.relayUrl, {
      method: "POST", headers: { Authorization: `Bearer ${settings.relayToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ smtp: { host: settings.host, port: settings.port, username: settings.username, password: settings.password,
        use_ssl: settings.useSsl, use_starttls: settings.useStarttls }, message: { from_email: settings.fromEmail, from_name: settings.fromName,
        to: input.to, subject: input.subject, text: input.text, html: input.html || "" } }), signal: AbortSignal.timeout(30000),
    });
    let data: { ok?: boolean; error?: string } = {};
    try { data = await response.json() as typeof data; } catch { /* stable error below */ }
    if (!response.ok || data.ok === false) throw Object.assign(new Error(data.error || `邮件中继返回 HTTP ${response.status}`), { status: 502 });
    return { sent: true, transport: "https_relay" as const };
  }
  if (settings.port === 25) throw Object.assign(new Error("当前运行平台禁止 SMTP 25 端口，请改用 465 或 587。"), { status: 400 });
  try {
    const { LogLevel, WorkerMailer } = await import("worker-mailer");
    await WorkerMailer.send({
      host: settings.host, port: settings.port, secure: settings.useSsl, startTls: settings.useStarttls,
      credentials: { username: settings.username, password: settings.password }, authType: ["login", "plain"],
      logLevel: LogLevel.ERROR, socketTimeoutMs: 20_000, responseTimeoutMs: 20_000,
    }, { from: { email: settings.fromEmail, name: settings.fromName }, to: input.to, subject: input.subject, text: input.text, html: input.html || undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知 SMTP 错误";
    throw Object.assign(new Error(`SMTP 发送失败：${message}`), { status: 502 });
  }
  return { sent: true, transport: "direct_smtp" as const };
}

export async function sendVerificationCode(email: string, code: string, purpose: "register" | "login", expiresMinutes: number) {
  const action = purpose === "register" ? "注册企业账号" : "登录 KnowFlow";
  const subject = `【KnowFlow】${action}验证码`;
  const text = `您的验证码是 ${code}，${expiresMinutes} 分钟内有效。请勿将验证码告诉任何人。`;
  const html = `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;max-width:560px;margin:auto;padding:32px;border:1px solid #e8e8ef;border-radius:20px;background:#fff"><div style="font-size:13px;color:#7253ea;font-weight:700;letter-spacing:.12em">KNOWFLOW SECURITY</div><h2 style="margin:14px 0 8px;color:#17213b">${escapeHtml(action)}</h2><p style="color:#667085">本次验证码为：</p><div style="font-size:34px;letter-spacing:.24em;font-weight:800;color:#17213b;background:#f5f3ff;padding:18px 22px;border-radius:14px;text-align:center">${escapeHtml(code)}</div><p style="color:#667085">验证码 ${expiresMinutes} 分钟内有效，仅可使用一次。若非本人操作，请忽略本邮件。</p></div>`;
  return sendMail({ to: email, subject, text, html });
}
