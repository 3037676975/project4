import { loadPaymentConfig, paymentConfigReady, type PaymentProvider } from "./payment-config";
import { alipayRequestSignContent, chinaPaymentTimestamp, rsaSha256Sign, rsaSha256Verify, yuanToCents } from "./payment-crypto";
import { getRuntime } from "./runtime";
import { queryWechatV2Order } from "./wechat-v2";

type LiveProvider = Exclude<PaymentProvider, "sandbox">;
export type PaymentLogDirection = "request" | "callback" | "query" | "refund" | "system";

export type ProviderQueryResult = {
  supported: boolean;
  provider: LiveProvider;
  orderNo: string;
  paid: boolean;
  tradeNo: string | null;
  amountCents: number | null;
  providerStatus: string;
  occurredAt: string | null;
  signatureValid: boolean;
  message: string;
};

const sensitiveKey = /(secret|password|private|api.*key|signature|token|authorization|ciphertext|(^|[_-])iv($|[_-]))/i;

function safeDetail(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeDetail(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 1000) : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).map(([key, item]) => [
    key,
    sensitiveKey.test(key) ? "[redacted]" : safeDetail(item, depth + 1),
  ]));
}

export async function writePaymentLabLog(input: {
  direction: PaymentLogDirection;
  provider: string;
  eventType: string;
  orderNo?: string | null;
  status: string;
  message?: string;
  detail?: unknown;
}) {
  try {
    const now = new Date().toISOString();
    await getRuntime().DB.prepare(`INSERT INTO payment_logs
      (id, direction, provider, event_type, order_no, status, message, detail_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        `paylog_${crypto.randomUUID().replaceAll("-", "")}`,
        input.direction.slice(0, 20), input.provider.slice(0, 30), input.eventType.slice(0, 80), input.orderNo?.slice(0, 80) || null,
        input.status.slice(0, 40), (input.message || "").slice(0, 500), JSON.stringify(safeDetail(input.detail ?? {})), now,
      ).run();
  } catch (error) {
    // Payment logging must never interrupt checkout/callback processing.
    console.warn("[payment-lab] log write skipped", error instanceof Error ? error.message : "unknown error");
  }
}

export async function listPaymentLabLogs(limit = 100) {
  const safeLimit = Math.min(300, Math.max(1, Math.round(limit)));
  try {
    const result = await getRuntime().DB.prepare(`SELECT id, direction, provider, event_type, order_no, status, message, detail_json, created_at
      FROM payment_logs ORDER BY created_at DESC LIMIT ?`).bind(safeLimit).all<Record<string, unknown>>();
    return (result.results || []).map((row) => {
      let detail: unknown = {};
      try { detail = JSON.parse(String(row.detail_json || "{}")); } catch { detail = {}; }
      return {
        id: row.id, direction: row.direction, provider: row.provider, eventType: row.event_type, orderNo: row.order_no,
        status: row.status, message: row.message, detail, createdAt: row.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function listPaymentLabOrders(limit = 100) {
  const safeLimit = Math.min(300, Math.max(1, Math.round(limit)));
  const result = await getRuntime().DB.prepare(`SELECT o.order_no, o.provider, o.status, o.amount_cents, o.currency, o.provider_trade_no,
    o.created_at, o.paid_at, o.fulfilled_at, o.expires_at, p.name AS plan_name, t.name AS tenant_name
    FROM billing_orders o JOIN plans p ON p.id = o.plan_id JOIN tenants t ON t.id = o.tenant_id
    ORDER BY o.created_at DESC LIMIT ?`).bind(safeLimit).all<Record<string, unknown>>();
  return (result.results || []).map((row) => ({
    orderNo: row.order_no, provider: row.provider, status: row.status, amountCents: Number(row.amount_cents || 0), currency: row.currency,
    providerTradeNo: row.provider_trade_no, planName: row.plan_name, tenantName: row.tenant_name,
    createdAt: row.created_at, paidAt: row.paid_at, fulfilledAt: row.fulfilled_at, expiresAt: row.expires_at,
  }));
}

function extractJsonObject(raw: string, key: string) {
  const marker = `"${key}"`;
  const keyIndex = raw.indexOf(marker);
  if (keyIndex < 0) return "";
  const colon = raw.indexOf(":", keyIndex + marker.length);
  if (colon < 0) return "";
  let start = colon + 1;
  while (/\s/.test(raw[start] || "")) start += 1;
  if (raw[start] !== "{") return "";
  let depth = 0; let inString = false; let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }
  return "";
}

async function queryAlipay(orderNo: string): Promise<ProviderQueryResult> {
  const config = await loadPaymentConfig("alipay");
  if (!paymentConfigReady(config)) throw new Error("支付宝渠道尚未完成正式配置。");
  const parameters: Record<string, string> = {
    app_id: config.merchantId,
    method: "alipay.trade.query",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: chinaPaymentTimestamp(),
    version: "1.0",
    biz_content: JSON.stringify({ out_trade_no: orderNo }),
  };
  parameters.sign = await rsaSha256Sign(alipayRequestSignContent(parameters), config.details.appPrivateKey || "");
  const response = await fetch(config.checkoutUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8", Accept: "application/json" },
    body: new URLSearchParams(parameters).toString(), signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`支付宝订单查询 HTTP ${response.status}`);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const payload = parsed.alipay_trade_query_response as Record<string, unknown> | undefined;
  if (!payload) throw new Error("支付宝订单查询返回缺少 alipay_trade_query_response。");
  const signedContent = extractJsonObject(raw, "alipay_trade_query_response");
  const signature = typeof parsed.sign === "string" ? parsed.sign : "";
  const signatureValid = Boolean(signedContent && signature && await rsaSha256Verify(signedContent, signature, config.details.alipayPublicKey || ""));
  if (!signatureValid) throw new Error("支付宝订单查询响应验签失败。");
  const tradeStatus = String(payload.trade_status || "UNKNOWN");
  const totalAmount = typeof payload.total_amount === "string" ? yuanToCents(payload.total_amount) : NaN;
  return {
    supported: true, provider: "alipay", orderNo, paid: tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED",
    tradeNo: typeof payload.trade_no === "string" ? payload.trade_no : null,
    amountCents: Number.isSafeInteger(totalAmount) ? totalAmount : null, providerStatus: tradeStatus, occurredAt: null,
    signatureValid, message: String(payload.sub_msg || payload.msg || tradeStatus),
  };
}

function wechatTime(value: string) {
  if (!/^\d{14}$/.test(value)) return null;
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function queryWechat(orderNo: string): Promise<ProviderQueryResult> {
  const config = await loadPaymentConfig("wechat");
  if (!paymentConfigReady(config)) throw new Error("微信支付 V2 渠道尚未完成正式配置。");
  const result = await queryWechatV2Order({
    appId: config.details.appId || "",
    merchantId: config.merchantId,
    apiV2Key: config.details.apiV2Key || "",
    orderQueryUrl: config.details.queryUrl || "https://api.mch.weixin.qq.com/pay/orderquery",
  }, orderNo);
  const data = result.data;
  if (data.return_code !== "SUCCESS") throw new Error(`微信 V2 查单通信失败：${data.return_msg || "UNKNOWN"}`);
  if (data.result_code !== "SUCCESS") return {
    supported: true, provider: "wechat", orderNo, paid: false, tradeNo: null, amountCents: null,
    providerStatus: data.err_code || "QUERY_FAIL", occurredAt: null, signatureValid: result.signatureValid,
    message: data.err_code_des || data.err_code || "微信 V2 查单未返回交易状态。",
  };
  const amount = Number(data.total_fee || 0); const tradeState = data.trade_state || "UNKNOWN";
  return {
    supported: true, provider: "wechat", orderNo, paid: tradeState === "SUCCESS",
    tradeNo: data.transaction_id || null, amountCents: Number.isSafeInteger(amount) && amount > 0 ? amount : null,
    providerStatus: tradeState, occurredAt: wechatTime(data.time_end || ""), signatureValid: result.signatureValid,
    message: data.trade_state_desc || tradeState,
  };
}

export async function queryPaymentProvider(orderNo: string, provider: LiveProvider): Promise<ProviderQueryResult> {
  if (provider === "alipay") return queryAlipay(orderNo);
  if (provider === "wechat") return queryWechat(orderNo);
  return { supported: false, provider: "gateway", orderNo, paid: false, tradeNo: null, amountCents: null, providerStatus: "UNSUPPORTED", occurredAt: null, signatureValid: false, message: "兼容网关未定义统一订单查询协议。" };
}

export function paymentLabProfile(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    name: "Payment Lab",
    implementation: "Project4 native TypeScript/Cloudflare runtime",
    reference: "3037676975/project3",
    providers: ["alipay-rsa2", "wechat-pay-v2-native"],
    rules: ["独立支付配置", "统一业务订单", "支付请求留痕", "回调必须验签", "回调幂等处理", "主动订单查询", "禁止重复发放权益", "密钥不写日志"],
    endpoints: {
      callback: `${base}/api/payments/callback?provider={provider}`,
      query: `${base}/api/payments/query?orderNo={orderNo}`,
      platform: `${base}/api/platform/payment/lab`,
      wechatV2: `${base}/platform/wechat-v2`,
    },
  };
}
