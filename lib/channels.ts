import { decryptSecret, encryptSecret } from "./crypto";
import { constantTimeEqual, sha256 } from "./security";
import { getRuntime } from "./runtime";

export type CustomerChannel = "wecom" | "wechat" | "dingtalk" | "feishu";

export type NativeChannelConfig = {
  tenantId: string; channel: CustomerChannel; assistantId: string; appId: string; appSecret: string;
  verifyToken: string; encryptionKey: string; agentId: string;
};

export type NativeInboundEvent = { eventId: string; userId: string; text: string; reply: Record<string, string> };

export const CHANNEL_PROVIDERS = {
  wecom: { name: "企业微信", appIdLabel: "企业 ID（CorpID）", secretLabel: "自建应用 Secret", tokenLabel: "回调 Token", keyLabel: "EncodingAESKey", agentIdLabel: "应用 AgentId", guide: "企业微信管理后台 → 应用管理 → 自建应用 → 接收消息" },
  wechat: { name: "微信公众号", appIdLabel: "公众号 AppID", secretLabel: "AppSecret", tokenLabel: "服务器 Token", keyLabel: "EncodingAESKey", agentIdLabel: "", guide: "微信公众平台 → 设置与开发 → 基本配置 → 服务器配置" },
  dingtalk: { name: "钉钉", appIdLabel: "应用 AppKey", secretLabel: "应用 AppSecret", tokenLabel: "回调 Token（如已设置）", keyLabel: "", agentIdLabel: "", guide: "钉钉开放平台 → 应用能力 → 机器人 → 消息接收模式（HTTP）" },
  feishu: { name: "飞书", appIdLabel: "应用 App ID", secretLabel: "App Secret", tokenLabel: "Verification Token", keyLabel: "Encrypt Key（可选）", agentIdLabel: "", guide: "飞书开放平台 → 事件与回调 → 事件配置 → 请求地址" },
} as const;

const encoder = new TextEncoder(); const decoder = new TextDecoder();
function hint(value: string) { return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "已配置"; }
function bytesToBase64(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64ToBytes(value: string) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function decodeXml(value: string) { return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
export function xmlTag(xml: string, name: string) { const match = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${name}>`, "i")); return decodeXml((match?.[1] ?? match?.[2] ?? "").trim()); }
async function sha1Hex(value: string) { const digest = await crypto.subtle.digest("SHA-1", encoder.encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
export async function wechatSignature(token: string, timestamp: string, nonce: string, encrypted = "") { return sha1Hex([token, timestamp, nonce, ...(encrypted ? [encrypted] : [])].sort().join("")); }
async function hmacBase64(secret: string, value: string) { const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(value)); return bytesToBase64(new Uint8Array(signed)); }
function parseJson<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }
function parseSecretBundle(value: string) { const parsed = parseJson<{ appSecret?: string; encryptionKey?: string }>(value, {}); return parsed.appSecret !== undefined ? { appSecret: parsed.appSecret || "", encryptionKey: parsed.encryptionKey || "" } : { appSecret: value, encryptionKey: "" }; }

export async function saveChannelConfig(input: { tenantId: string; assistantId: string; channel: CustomerChannel; appId: string; secret: string; verifyToken: string; encryptionKey: string; agentId: string; enabled: boolean }) {
  const runtime = getRuntime(); if (!runtime.CONFIG_ENCRYPTION_KEY) throw new Error("站点加密密钥尚未初始化。");
  const current = await runtime.DB.prepare(`SELECT app_id_ciphertext, app_id_iv, app_id_hint, secret_ciphertext, secret_iv, secret_hint,
    verify_token_ciphertext, verify_token_iv, config_json FROM channel_configs WHERE tenant_id = ? AND channel = ?`)
    .bind(input.tenantId, input.channel).first<Record<string, string | null>>();
  let appCipher = current?.app_id_ciphertext || null; let appIv = current?.app_id_iv || null; let appHint = current?.app_id_hint || null;
  let secretCipher = current?.secret_ciphertext || null; let secretIv = current?.secret_iv || null; let secretHint = current?.secret_hint || null;
  let tokenCipher = current?.verify_token_ciphertext || null; let tokenIv = current?.verify_token_iv || null;
  let currentBundle = { appSecret: "", encryptionKey: "" };
  if (secretCipher && secretIv) currentBundle = parseSecretBundle(await decryptSecret(secretCipher, secretIv, runtime.CONFIG_ENCRYPTION_KEY));
  const appId = input.appId.trim(); const appSecret = input.secret.trim() || currentBundle.appSecret; const encryptionKey = input.encryptionKey.trim() || currentBundle.encryptionKey;
  const currentConfig = parseJson<{ agentId?: string }>(current?.config_json || "{}", {}); const agentId = input.agentId.trim() || currentConfig.agentId || "";
  if (appId) { const encrypted = await encryptSecret(appId, runtime.CONFIG_ENCRYPTION_KEY); appCipher = encrypted.ciphertext; appIv = encrypted.iv; appHint = hint(appId); }
  if (input.secret.trim() || input.encryptionKey.trim()) { const encrypted = await encryptSecret(JSON.stringify({ appSecret, encryptionKey }), runtime.CONFIG_ENCRYPTION_KEY); secretCipher = encrypted.ciphertext; secretIv = encrypted.iv; secretHint = appSecret ? hint(appSecret) : null; }
  if (input.verifyToken.trim()) { const token = input.verifyToken.trim(); if (token.length < 3 || token.length > 128) throw new Error("回调 Token 长度应为 3～128 个字符。"); const encrypted = await encryptSecret(token, runtime.CONFIG_ENCRYPTION_KEY); tokenCipher = encrypted.ciphertext; tokenIv = encrypted.iv; }
  if (encryptionKey && ["wecom", "wechat"].includes(input.channel) && encryptionKey.length !== 43) throw new Error("EncodingAESKey 必须是 43 个字符。");
  if (input.enabled) {
    if (!appCipher || !appIv || !appSecret) throw new Error(`启用${CHANNEL_PROVIDERS[input.channel].name}前必须填写应用 ID 和 Secret。`);
    if (["wecom", "wechat", "feishu"].includes(input.channel) && (!tokenCipher || !tokenIv)) throw new Error(`启用${CHANNEL_PROVIDERS[input.channel].name}前必须填写回调 Token。`);
    if (input.channel === "wecom" && !agentId) throw new Error("企业微信原生应用需要填写 AgentId。");
  }
  const now = new Date().toISOString(); const configJson = JSON.stringify({ mode: "native_v1", provider: input.channel, agentId, encryptionConfigured: Boolean(encryptionKey) });
  await runtime.DB.prepare(`INSERT INTO channel_configs
    (id, tenant_id, assistant_id, channel, app_id_ciphertext, app_id_iv, app_id_hint, secret_ciphertext, secret_iv, secret_hint,
     verify_token_ciphertext, verify_token_iv, status, config_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, channel) DO UPDATE SET assistant_id = excluded.assistant_id, app_id_ciphertext = excluded.app_id_ciphertext,
    app_id_iv = excluded.app_id_iv, app_id_hint = excluded.app_id_hint, secret_ciphertext = excluded.secret_ciphertext,
    secret_iv = excluded.secret_iv, secret_hint = excluded.secret_hint, verify_token_ciphertext = excluded.verify_token_ciphertext,
    verify_token_iv = excluded.verify_token_iv, status = excluded.status, config_json = excluded.config_json, updated_at = excluded.updated_at`)
    .bind(`channel_${input.channel}_${input.tenantId.slice(-10)}`, input.tenantId, input.assistantId, input.channel, appCipher, appIv, appHint,
      secretCipher, secretIv, secretHint, tokenCipher, tokenIv, input.enabled ? "active" : "disabled", configJson, now).run();
  return { channel: input.channel, assistantId: input.assistantId, appIdHint: appHint, secretHint, enabled: input.enabled, mode: "native_v1", agentId, encryptionConfigured: Boolean(encryptionKey), updatedAt: now };
}

export async function listChannelConfigs(tenantId: string, origin: string) {
  const result = await getRuntime().DB.prepare("SELECT channel, assistant_id, app_id_hint, secret_hint, status, config_json, updated_at FROM channel_configs WHERE tenant_id = ? ORDER BY channel").bind(tenantId).all();
  return (result.results as Array<Record<string, unknown>>).map((row) => { const channel = String(row.channel) as CustomerChannel; const config = parseJson<{ agentId?: string; encryptionConfigured?: boolean }>(String(row.config_json || "{}"), {}); return {
    channel, assistantId: row.assistant_id, appIdHint: row.app_id_hint, secretHint: row.secret_hint, enabled: row.status === "active",
    mode: "native_v1", agentId: config.agentId || "", encryptionConfigured: Boolean(config.encryptionConfigured),
    callbackUrl: `${origin.replace(/\/$/, "")}/api/channels/inbound?tenantId=${encodeURIComponent(tenantId)}&channel=${encodeURIComponent(channel)}`, updatedAt: row.updated_at,
  }; });
}

export async function loadNativeChannelConfig(tenantId: string, channel: string, requireActive = true): Promise<NativeChannelConfig | null> {
  const runtime = getRuntime(); if (!runtime.CONFIG_ENCRYPTION_KEY || !/^(wecom|wechat|dingtalk|feishu)$/.test(channel)) return null;
  const row = await runtime.DB.prepare(`SELECT assistant_id, app_id_ciphertext, app_id_iv, secret_ciphertext, secret_iv,
    verify_token_ciphertext, verify_token_iv, config_json FROM channel_configs WHERE tenant_id = ? AND channel = ? ${requireActive ? "AND status = 'active'" : ""}`)
    .bind(tenantId, channel).first<Record<string, string | null>>();
  if (!row?.app_id_ciphertext || !row.app_id_iv || !row.secret_ciphertext || !row.secret_iv) return null;
  const bundle = parseSecretBundle(await decryptSecret(row.secret_ciphertext, row.secret_iv, runtime.CONFIG_ENCRYPTION_KEY)); const stored = parseJson<{ agentId?: string }>(row.config_json || "{}", {});
  const verifyToken = row.verify_token_ciphertext && row.verify_token_iv ? await decryptSecret(row.verify_token_ciphertext, row.verify_token_iv, runtime.CONFIG_ENCRYPTION_KEY) : "";
  return { tenantId, channel: channel as CustomerChannel, assistantId: row.assistant_id || "", appId: await decryptSecret(row.app_id_ciphertext, row.app_id_iv, runtime.CONFIG_ENCRYPTION_KEY), appSecret: bundle.appSecret, verifyToken, encryptionKey: bundle.encryptionKey, agentId: stored.agentId || "" };
}

function encodingAesKey(value: string) { const bytes = base64ToBytes(`${value}=`); if (bytes.length !== 32) throw new Error("EncodingAESKey 无效。"); return bytes; }
function pkcs7Pad(bytes: Uint8Array) { const amount = 32 - (bytes.length % 32 || 32) || 32; const output = new Uint8Array(bytes.length + amount); output.set(bytes); output.fill(amount, bytes.length); return output; }
function pkcs7Unpad(bytes: Uint8Array) { const amount = bytes[bytes.length - 1]; if (!amount || amount > 32 || amount > bytes.length) throw new Error("渠道消息填充无效。"); return bytes.slice(0, bytes.length - amount); }
function uint32(value: number) { return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]); }
function readUint32(bytes: Uint8Array) { return (((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]) >>> 0; }
async function decryptWechatMessage(encrypted: string, keyValue: string, expectedReceiveId: string) {
  const rawKey = encodingAesKey(keyValue); const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CBC" }, false, ["decrypt"]);
  const clear = pkcs7Unpad(new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: rawKey.slice(0, 16) }, key, base64ToBytes(encrypted))));
  if (clear.length < 20) throw new Error("渠道加密消息不完整。"); const length = readUint32(clear.slice(16, 20)); const xml = decoder.decode(clear.slice(20, 20 + length)); const receiveId = decoder.decode(clear.slice(20 + length));
  if (expectedReceiveId && receiveId && receiveId !== expectedReceiveId) throw new Error("渠道消息接收方不匹配。"); return xml;
}
async function encryptWechatMessage(xml: string, keyValue: string, receiveId: string) {
  const random = crypto.getRandomValues(new Uint8Array(16)); const message = encoder.encode(xml); const target = encoder.encode(receiveId); const clear = new Uint8Array(20 + message.length + target.length);
  clear.set(random); clear.set(uint32(message.length), 16); clear.set(message, 20); clear.set(target, 20 + message.length);
  const rawKey = encodingAesKey(keyValue); const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CBC" }, false, ["encrypt"]);
  return bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: rawKey.slice(0, 16) }, key, pkcs7Pad(clear))));
}
export async function decryptFeishuPayload(encrypted: string, keyValue: string) {
  const payload = base64ToBytes(encrypted); if (payload.length <= 16) throw new Error("飞书加密事件不完整。");
  const keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(keyValue)));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({ name: "AES-CBC", iv: payload.slice(0, 16) }, key, payload.slice(16));
  try { return JSON.parse(decoder.decode(clear)) as Record<string, unknown>; }
  catch { throw new Error("飞书加密事件解密后不是有效 JSON。"); }
}
function textXml(toUser: string, fromUser: string, answer: string) { return `<xml><ToUserName><![CDATA[${toUser.replace(/\]\]>/g, "] ]>")}]]></ToUserName><FromUserName><![CDATA[${fromUser.replace(/\]\]>/g, "] ]>")}]]></FromUserName><CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${answer.replace(/\]\]>/g, "] ]>")}]]></Content></xml>`; }

export async function nativeChallengeResponse(request: Request, config: NativeChannelConfig) {
  if (!["wecom", "wechat"].includes(config.channel)) return null; const url = new URL(request.url);
  const timestamp = url.searchParams.get("timestamp") || ""; const nonce = url.searchParams.get("nonce") || ""; const echo = url.searchParams.get("echostr") || "";
  const signature = url.searchParams.get("msg_signature") || url.searchParams.get("signature") || ""; if (!timestamp || !nonce || !echo || !signature) return new Response("invalid challenge", { status: 400 });
  const encrypted = Boolean(url.searchParams.get("msg_signature")); const expected = await wechatSignature(config.verifyToken, timestamp, nonce, encrypted ? echo : "");
  if (!constantTimeEqual(expected, signature.toLowerCase())) return new Response("invalid signature", { status: 401 });
  if (encrypted) { if (!config.encryptionKey) return new Response("encryption key required", { status: 400 }); return new Response(await decryptWechatMessage(echo, config.encryptionKey, config.appId), { headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  return new Response(echo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function parseNativeInbound(request: Request, raw: string, config: NativeChannelConfig): Promise<{ event?: NativeInboundEvent; response?: Response }> {
  if (config.channel === "wecom" || config.channel === "wechat") {
    const url = new URL(request.url); const timestamp = url.searchParams.get("timestamp") || ""; const nonce = url.searchParams.get("nonce") || "";
    const encryptedPayload = xmlTag(raw, "Encrypt"); const signature = url.searchParams.get(encryptedPayload ? "msg_signature" : "signature") || ""; const expected = await wechatSignature(config.verifyToken, timestamp, nonce, encryptedPayload);
    if (!signature || !constantTimeEqual(expected, signature.toLowerCase())) return { response: new Response("invalid signature", { status: 401 }) };
    let xml = raw; if (encryptedPayload) { if (!config.encryptionKey) return { response: new Response("encryption key required", { status: 400 }) }; xml = await decryptWechatMessage(encryptedPayload, config.encryptionKey, config.appId); }
    if (xmlTag(xml, "MsgType") !== "text") return { response: new Response("success") };
    const text = xmlTag(xml, "Content").trim().slice(0, 2000); const userId = xmlTag(xml, "FromUserName"); const toUser = xmlTag(xml, "ToUserName"); const eventId = (xmlTag(xml, "MsgId") || await sha256(`${timestamp}|${nonce}|${userId}|${text}`)).slice(0, 160);
    if (!text || !userId) return { response: new Response("success") }; return { event: { eventId, userId, text, reply: { toUser, fromUser: userId, encrypted: encryptedPayload ? "1" : "0" } } };
  }
  let body: Record<string, unknown>; try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return { response: Response.json({ error: "invalid json" }, { status: 400 }) }; }
  if (config.channel === "feishu") {
    const timestamp = request.headers.get("x-lark-request-timestamp") || ""; const nonce = request.headers.get("x-lark-request-nonce") || ""; const signature = request.headers.get("x-lark-signature") || "";
    if (config.encryptionKey && signature) { const expected = await sha256(`${timestamp}${nonce}${config.encryptionKey}${raw}`); if (!constantTimeEqual(expected, signature.toLowerCase())) return { response: Response.json({ error: "invalid signature" }, { status: 401 }) }; }
    if (typeof body.encrypt === "string") { if (!config.encryptionKey) return { response: Response.json({ error: "encrypt key required" }, { status: 400 }) }; body = await decryptFeishuPayload(body.encrypt, config.encryptionKey); }
    if (typeof body.challenge === "string") { if (config.verifyToken && body.token !== config.verifyToken) return { response: Response.json({ error: "invalid token" }, { status: 401 }) }; return { response: Response.json({ challenge: body.challenge }) }; }
    const header = (body.header || {}) as Record<string, unknown>; if (config.verifyToken && header.token !== config.verifyToken && body.token !== config.verifyToken) return { response: Response.json({ error: "invalid verification token" }, { status: 401 }) };
    const event = (body.event || {}) as Record<string, unknown>; const message = (event.message || {}) as Record<string, unknown>; const sender = (event.sender || {}) as Record<string, unknown>; const senderId = (sender.sender_id || {}) as Record<string, unknown>;
    const content = parseJson<{ text?: string }>(String(message.content || "{}"), {}); const text = String(content.text || "").trim().slice(0, 2000); const userId = String(senderId.open_id || senderId.user_id || ""); const eventId = String(header.event_id || message.message_id || "").slice(0, 160);
    if (!eventId || !userId || !text) return { response: Response.json({ code: 0, msg: "ignored" }) }; return { event: { eventId, userId, text, reply: { receiveId: userId } } };
  }
  const url = new URL(request.url); const timestamp = request.headers.get("timestamp") || request.headers.get("x-dingtalk-timestamp") || url.searchParams.get("timestamp") || ""; const signature = request.headers.get("sign") || request.headers.get("x-dingtalk-sign") || url.searchParams.get("sign") || "";
  if (signature && timestamp) { const expected = await hmacBase64(config.appSecret, `${timestamp}\n${config.appSecret}`); if (!constantTimeEqual(expected, decodeURIComponent(signature))) return { response: Response.json({ error: "invalid signature" }, { status: 401 }) }; }
  const textBlock = (body.text || {}) as Record<string, unknown>; const text = String(textBlock.content || body.content || "").trim().slice(0, 2000); const userId = String(body.senderStaffId || body.senderId || body.senderCorpId || ""); const eventId = String(body.msgId || body.messageId || "").slice(0, 160);
  if (!eventId || !userId || !text) return { response: Response.json({ msg: "success" }) }; return { event: { eventId, userId, text, reply: { sessionWebhook: String(body.sessionWebhook || "") } } };
}

export async function nativeAnswerResponse(config: NativeChannelConfig, event: NativeInboundEvent, answer: string) {
  if (config.channel === "wecom" || config.channel === "wechat") {
    const xml = textXml(event.reply.fromUser, event.reply.toUser, answer); if (event.reply.encrypted !== "1") return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
    const timestamp = String(Math.floor(Date.now() / 1000)); const nonce = crypto.randomUUID().replaceAll("-", "").slice(0, 16); const encrypted = await encryptWechatMessage(xml, config.encryptionKey, config.appId); const signature = await wechatSignature(config.verifyToken, timestamp, nonce, encrypted);
    return new Response(`<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt><MsgSignature><![CDATA[${signature}]]></MsgSignature><TimeStamp>${timestamp}</TimeStamp><Nonce><![CDATA[${nonce}]]></Nonce></xml>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }
  await sendNativeReply(config, event, answer); return config.channel === "feishu" ? Response.json({ code: 0, msg: "success" }) : Response.json({ msg: "success" });
}

async function jsonFetch(url: string, init: RequestInit) { const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) }); const data = await response.json() as Record<string, unknown>; if (!response.ok) throw new Error(String(data.msg || data.errmsg || data.message || `HTTP ${response.status}`)); return data; }
export async function testNativeChannel(config: NativeChannelConfig) {
  if (config.channel === "wecom") { const data = await jsonFetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.appId)}&corpsecret=${encodeURIComponent(config.appSecret)}`, { method: "GET" }); if (Number(data.errcode || 0) !== 0 || !data.access_token) throw new Error(String(data.errmsg || "企业微信未返回 access_token")); }
  else if (config.channel === "wechat") { const data = await jsonFetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(config.appId)}&secret=${encodeURIComponent(config.appSecret)}`, { method: "GET" }); if (Number(data.errcode || 0) !== 0 || !data.access_token) throw new Error(String(data.errmsg || "微信公众号未返回 access_token")); }
  else if (config.channel === "feishu") { const data = await jsonFetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }) }); if (Number(data.code || 0) !== 0 || !data.tenant_access_token) throw new Error(String(data.msg || "飞书未返回 tenant_access_token")); }
  else { const data = await jsonFetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appKey: config.appId, appSecret: config.appSecret }) }); if (!data.accessToken) throw new Error(String(data.message || "钉钉未返回 accessToken")); }
  return { ok: true, message: `${CHANNEL_PROVIDERS[config.channel].name}原生鉴权连接成功` };
}

async function sendNativeReply(config: NativeChannelConfig, event: NativeInboundEvent, answer: string) {
  if (config.channel === "feishu") {
    const token = await jsonFetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }) });
    const data = await jsonFetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id", { method: "POST", headers: { Authorization: `Bearer ${token.tenant_access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ receive_id: event.reply.receiveId, msg_type: "text", content: JSON.stringify({ text: answer }) }) });
    if (Number(data.code || 0) !== 0) throw new Error(String(data.msg || "飞书回复失败")); return;
  }
  const webhook = event.reply.sessionWebhook; if (!webhook) throw new Error("钉钉回调未包含 sessionWebhook，无法原生回复。"); const url = new URL(webhook);
  if (url.protocol !== "https:" || !(url.hostname === "api.dingtalk.com" || url.hostname === "oapi.dingtalk.com" || url.hostname.endsWith(".dingtalk.com"))) throw new Error("钉钉 sessionWebhook 域名不受信任。");
  await jsonFetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msgtype: "text", text: { content: answer } }) });
}
