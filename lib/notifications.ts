import { decryptSecret, encryptSecret } from "./crypto";
import { sendMail } from "./mail";
import { getRuntime } from "./runtime";

export type NotificationChannel = "wecom" | "email" | "sms" | "webhook";

function hint(value: string) { return value.length > 16 ? `${value.slice(0, 10)}…${value.slice(-4)}` : "已配置"; }
function emailHint(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "已绑定客服邮箱";
  return `${local.slice(0, 2)}${local.length > 2 ? "•••" : ""}@${domain}`;
}

export function normalizeNotificationEndpoint(channel: NotificationChannel, value: string) {
  const trimmed = value.trim();
  if (channel === "email") {
    const email = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请输入有效的客服通知邮箱。" );
    return email;
  }
  const url = new URL(trimmed); const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("通知地址必须是公网 HTTPS URL。");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(":")) throw new Error("通知地址不能使用本机、内网或 IP 地址。");
  if (channel === "wecom" && (host !== "qyapi.weixin.qq.com" || url.pathname !== "/cgi-bin/webhook/send" || !url.searchParams.get("key"))) throw new Error("企业微信机器人地址格式不正确。");
  if (channel !== "wecom" && url.search) throw new Error("通用通知地址不能包含查询参数。");
  return url.toString();
}

export async function saveNotificationConfig(input: { tenantId: string; channel: NotificationChannel; endpoint: string; secret: string; events: string[]; enabled: boolean }) {
  const runtime = getRuntime(); if (!runtime.CONFIG_ENCRYPTION_KEY) throw new Error("站点加密密钥尚未初始化。");
  const current = await runtime.DB.prepare(`SELECT endpoint_ciphertext, endpoint_iv, endpoint_hint, secret_ciphertext, secret_iv, secret_hint
    FROM notification_configs WHERE tenant_id = ? AND channel = ?`).bind(input.tenantId, input.channel).first<Record<string, string | null>>();
  let endpointCiphertext = current?.endpoint_ciphertext || null; let endpointIv = current?.endpoint_iv || null; let endpointHint = current?.endpoint_hint || null;
  let secretCiphertext = current?.secret_ciphertext || null; let secretIv = current?.secret_iv || null; let secretHint = current?.secret_hint || null;
  if (input.endpoint) {
    const endpoint = normalizeNotificationEndpoint(input.channel, input.endpoint); const encrypted = await encryptSecret(endpoint, runtime.CONFIG_ENCRYPTION_KEY);
    endpointCiphertext = encrypted.ciphertext; endpointIv = encrypted.iv; endpointHint = input.channel === "email" ? emailHint(endpoint) : hint(endpoint);
  }
  if (input.secret && input.channel !== "email") { const encrypted = await encryptSecret(input.secret.trim(), runtime.CONFIG_ENCRYPTION_KEY); secretCiphertext = encrypted.ciphertext; secretIv = encrypted.iv; secretHint = hint(input.secret.trim()); }
  if (input.enabled && (!endpointCiphertext || !endpointIv)) throw new Error(input.channel === "email" ? "启用通知前必须绑定客服邮箱。" : "启用通知前必须填写有效地址。");
  const now = new Date().toISOString();
  await runtime.DB.prepare(`INSERT INTO notification_configs
    (id, tenant_id, channel, endpoint_ciphertext, endpoint_iv, endpoint_hint, secret_ciphertext, secret_iv, secret_hint, events_json, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, channel) DO UPDATE SET endpoint_ciphertext = excluded.endpoint_ciphertext, endpoint_iv = excluded.endpoint_iv,
    endpoint_hint = excluded.endpoint_hint, secret_ciphertext = excluded.secret_ciphertext, secret_iv = excluded.secret_iv,
    secret_hint = excluded.secret_hint, events_json = excluded.events_json, status = excluded.status, updated_at = excluded.updated_at`)
    .bind(`notify_${input.channel}_${input.tenantId.slice(-12)}`, input.tenantId, input.channel, endpointCiphertext, endpointIv, endpointHint,
      secretCiphertext, secretIv, secretHint, JSON.stringify(input.events), input.enabled ? "active" : "disabled", now).run();
  return { channel: input.channel, endpointHint, secretHint, events: input.events, enabled: input.enabled, updatedAt: now };
}

export async function listNotificationConfigs(tenantId: string) {
  const result = await getRuntime().DB.prepare(`SELECT channel, endpoint_hint, secret_hint, events_json, status, updated_at
    FROM notification_configs WHERE tenant_id = ? ORDER BY channel`).bind(tenantId).all();
  return (result.results as Array<Record<string, unknown>>).map((row) => ({ channel: row.channel, endpointHint: row.endpoint_hint, secretHint: row.secret_hint,
    events: JSON.parse(String(row.events_json || "[]")), enabled: row.status === "active", updatedAt: row.updated_at }));
}

export async function queueNotifications(input: { tenantId: string; eventType: string; entityType: string; entityId: string; payload: Record<string, unknown> }) {
  const runtime = getRuntime(); const configs = await runtime.DB.prepare("SELECT channel, events_json FROM notification_configs WHERE tenant_id = ? AND status = 'active'").bind(input.tenantId).all();
  const now = new Date().toISOString(); const statements = (configs.results as Array<{ channel: string; events_json: string }>).flatMap((row) => {
    let events: string[] = []; try { events = JSON.parse(row.events_json) as string[]; } catch { /* no events */ }
    if (!events.includes(input.eventType) && !events.includes("*")) return [];
    return [runtime.DB.prepare(`INSERT INTO notification_outbox
      (id, tenant_id, channel, event_type, entity_type, entity_id, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`)
      .bind(`out_${crypto.randomUUID().replaceAll("-", "")}`, input.tenantId, row.channel, input.eventType, input.entityType, input.entityId, JSON.stringify(input.payload), now, now, now)];
  });
  if (statements.length) await runtime.DB.batch(statements);
  return statements.length;
}

async function decryptConfig(tenantId: string, channel: string) {
  const runtime = getRuntime(); if (!runtime.CONFIG_ENCRYPTION_KEY) return null;
  const row = await runtime.DB.prepare(`SELECT endpoint_ciphertext, endpoint_iv, secret_ciphertext, secret_iv
    FROM notification_configs WHERE tenant_id = ? AND channel = ? AND status = 'active'`).bind(tenantId, channel).first<Record<string, string | null>>();
  if (!row?.endpoint_ciphertext || !row.endpoint_iv) return null;
  return { endpoint: await decryptSecret(row.endpoint_ciphertext, row.endpoint_iv, runtime.CONFIG_ENCRYPTION_KEY),
    secret: row.secret_ciphertext && row.secret_iv ? await decryptSecret(row.secret_ciphertext, row.secret_iv, runtime.CONFIG_ENCRYPTION_KEY) : "" };
}

function notificationText(eventType: string, entityId: string, payload: Record<string, unknown>) {
  const title = String(payload.title || payload.subject || payload.description || payload.message || entityId).slice(0, 1800);
  return `[KnowFlow] ${eventType}\n\n${title}`;
}

export async function flushNotificationOutbox(tenantId: string, limit = 10) {
  const runtime = getRuntime(); const now = new Date().toISOString();
  const result = await runtime.DB.prepare(`SELECT id, channel, event_type, entity_type, entity_id, payload_json, attempts
    FROM notification_outbox WHERE tenant_id = ? AND status IN ('pending','retry') AND next_attempt_at <= ? ORDER BY created_at LIMIT ?`)
    .bind(tenantId, now, Math.max(1, Math.min(limit, 25))).all();
  let sent = 0; let failed = 0;
  for (const row of result.results as Array<Record<string, unknown>>) {
    try {
      const channel = String(row.channel) as NotificationChannel;
      const config = await decryptConfig(tenantId, channel); if (!config) throw new Error("通知渠道未启用");
      const payload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
      if (channel === "email") {
        const text = notificationText(String(row.event_type), String(row.entity_id), payload);
        await sendMail({
          to: config.endpoint,
          subject: `【KnowFlow 客服通知】${String(row.event_type)}`,
          text,
          html: `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;padding:24px"><h2>KnowFlow 客服通知</h2><p><b>${String(row.event_type)}</b></p><p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br/>")}</p></div>`,
        });
      } else {
        const body = channel === "wecom" ? { msgtype: "text", text: { content: notificationText(String(row.event_type), String(row.entity_id), payload) } }
          : { event: row.event_type, entityType: row.entity_type, entityId: row.entity_id, data: payload };
        const response = await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(config.secret ? { Authorization: `Bearer ${config.secret}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      }
      await runtime.DB.prepare("UPDATE notification_outbox SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?").bind(now, now, row.id).run(); sent += 1;
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1; const status = attempts >= 5 ? "failed" : "retry";
      const next = new Date(Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000).toISOString();
      await runtime.DB.prepare("UPDATE notification_outbox SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?")
        .bind(status, attempts, next, error instanceof Error ? error.message.slice(0, 300) : "发送失败", now, row.id).run(); failed += 1;
    }
  }
  return { sent, failed, processed: sent + failed };
}
