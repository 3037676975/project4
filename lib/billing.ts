import { PublicApiError } from "./api-keys";
import { constantTimeEqual, hmacSha256, sha256 } from "./security";
import { getRuntime } from "./runtime";
import { alipayNotificationSignContent, alipayRequestSignContent, chinaPaymentTimestamp, rsaSha256Sign, rsaSha256Verify, yuanToCents } from "./payment-crypto";
import { channelSupportsAmount, loadPaymentConfig, loadPaymentConfigs, paymentConfigReady, publicPaymentChannel, type PaymentProvider } from "./payment-config";
import { createWechatV2NativeOrder, wechatV2ParseXml, wechatV2Verify } from "./wechat-v2";

export type { PaymentProvider } from "./payment-config";

export async function paymentState() {
  const runtime = getRuntime(); const configs = await loadPaymentConfigs();
  let publicBaseReady = false; let callbackHttpsReady = false;
  try {
    const publicBase = new URL(runtime.APP_BASE_URL || "");
    publicBaseReady = publicBase.protocol === "http:" || publicBase.protocol === "https:";
    callbackHttpsReady = publicBase.protocol === "https:";
  } catch { publicBaseReady = false; callbackHttpsReady = false; }
  const channels = configs.map((config) => ({ ...publicPaymentChannel(config), ready: publicBaseReady && paymentConfigReady(config) }));
  const sandbox = configs.find((item) => item.mode === "sandbox");
  if (sandbox) return { mode: "sandbox", provider: "sandbox" as const, ready: true, callbackHttpsReady, source: sandbox.source, merchantName: sandbox.merchantName, channels };
  const preferred = channels.find((item) => item.mode === "production" && item.ready);
  return {
    mode: configs.some((item) => item.mode === "production") ? "production" : "disabled",
    provider: preferred?.provider || channels[0]?.provider || "gateway",
    ready: Boolean(preferred),
    callbackHttpsReady,
    source: configs[0]?.source || "database",
    merchantName: configs[0]?.merchantName || "",
    channels,
  };
}

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `KF${date}${random[0].toString(36).toUpperCase()}${random[1].toString(36).toUpperCase()}`.slice(0, 32);
}

export async function buildCheckout(input: { orderNo: string; amountCents: number; provider: PaymentProvider; description: string }) {
  const runtime = getRuntime(); const config = await loadPaymentConfig(input.provider);
  if (input.provider === "sandbox") return { paymentUrl: null, providerTradeNo: null };
  if (!paymentConfigReady(config) || !channelSupportsAmount(config, input.amountCents)) {
    throw new PublicApiError(503, "支付商户尚未配置，不能创建真实支付链接。", "payment_not_configured");
  }
  const callbackUrl = `${(runtime.APP_BASE_URL || "").replace(/\/$/, "")}/api/payments/callback?provider=${input.provider}`;
  if (input.provider === "alipay") {
    const parameters: Record<string, string> = {
      app_id: config.merchantId,
      method: "alipay.trade.page.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: chinaPaymentTimestamp(),
      version: "1.0",
      notify_url: callbackUrl,
      return_url: config.details.returnUrl || `${(runtime.APP_BASE_URL || "").replace(/\/$/, "")}/workspace`,
      biz_content: JSON.stringify({ out_trade_no: input.orderNo, product_code: "FAST_INSTANT_TRADE_PAY", total_amount: (input.amountCents / 100).toFixed(2), subject: input.description.slice(0, 128) }),
    };
    parameters.sign = await rsaSha256Sign(alipayRequestSignContent(parameters), config.details.appPrivateKey || "");
    const checkout = new URL(config.checkoutUrl);
    checkout.search = new URLSearchParams(parameters).toString();
    return { paymentUrl: checkout.toString(), providerTradeNo: null };
  }
  if (input.provider === "wechat") {
    try {
      const checkout = await createWechatV2NativeOrder({
        appId: config.details.appId || "",
        merchantId: config.merchantId,
        apiV2Key: config.details.apiV2Key || "",
        unifiedOrderUrl: config.checkoutUrl,
        orderQueryUrl: config.details.queryUrl || "https://api.mch.weixin.qq.com/pay/orderquery",
        notifyUrl: callbackUrl,
        spbillCreateIp: config.details.spbillCreateIp || "",
      }, { orderNo: input.orderNo, amountCents: input.amountCents, description: input.description });
      return { paymentUrl: checkout.codeUrl, providerTradeNo: null };
    } catch (error) {
      throw new PublicApiError(502, error instanceof Error ? error.message : "微信 V2 下单失败。", "payment_gateway_error");
    }
  }
  const checkout = new URL(config.checkoutUrl);
  if (checkout.protocol !== "https:") throw new PublicApiError(503, "支付网关必须使用 HTTPS。", "payment_not_configured");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = [config.merchantId, input.orderNo, input.amountCents, "CNY", timestamp, callbackUrl].join("\n");
  const signature = await hmacSha256(config.details.callbackSecret || "", canonical);
  checkout.searchParams.set("merchant_id", config.merchantId);
  checkout.searchParams.set("provider", input.provider);
  checkout.searchParams.set("order_no", input.orderNo);
  checkout.searchParams.set("amount", String(input.amountCents));
  checkout.searchParams.set("currency", "CNY");
  checkout.searchParams.set("description", input.description);
  checkout.searchParams.set("timestamp", timestamp);
  checkout.searchParams.set("callback_url", callbackUrl);
  checkout.searchParams.set("signature", signature);
  return { paymentUrl: checkout.toString(), providerTradeNo: null };
}

export async function createBillingOrder(input: {
  tenantId: string; memberId: string; planCode: string; requestedProvider?: string; clientRequestId?: string;
}) {
  const runtime = getRuntime(); const state = await paymentState();
  if (!state.ready) throw new PublicApiError(503, "支付功能尚未完成商户配置，系统不会绕过付款直接升级。", "payment_not_configured");
  const requested = input.requestedProvider === "wechat" || input.requestedProvider === "alipay" || input.requestedProvider === "gateway" ? input.requestedProvider : undefined;
  const available = state.channels.filter((item) => item.ready).map((item) => item.provider);
  if (state.mode === "production" && requested && !available.includes(requested)) throw new PublicApiError(400, "所选支付渠道尚未启用或配置不完整。", "payment_provider_mismatch");
  const provider = state.mode === "sandbox" ? "sandbox" : (requested || state.provider);
  if (provider !== "sandbox" && provider !== "wechat" && provider !== "alipay" && provider !== "gateway") throw new PublicApiError(400, "支付方式无效。");
  if (state.mode === "production" && provider === "sandbox") throw new PublicApiError(403, "生产环境不能使用沙箱付款。");
  const target = await runtime.DB.prepare("SELECT id, code, name, monthly_price_cents FROM plans WHERE code = ? AND active = 1").bind(input.planCode).first<{ id: string; code: string; name: string; monthly_price_cents: number }>();
  if (!target || target.monthly_price_cents <= 0) throw new PublicApiError(400, "请选择有效的付费套餐。");
  if (provider !== "sandbox" && !channelSupportsAmount(await loadPaymentConfig(provider), target.monthly_price_cents)) throw new PublicApiError(400, "订单金额不在所选支付渠道允许的范围内。", "payment_amount_unsupported");
  const requestId = (input.clientRequestId || crypto.randomUUID()).slice(0, 100);
  const existing = await runtime.DB.prepare(`SELECT id, order_no, status, amount_cents, provider, payment_url, expires_at
    FROM billing_orders WHERE tenant_id = ? AND client_request_id = ?`).bind(input.tenantId, requestId).first<Record<string, unknown>>();
  if (existing) return serializeOrder(existing);
  const orderNo = orderNumber(); const now = new Date(); const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const checkout = await buildCheckout({ orderNo, amountCents: target.monthly_price_cents, provider, description: `KnowFlow ${target.name}月度订阅` });
  const id = `ord_${crypto.randomUUID().replaceAll("-", "")}`;
  await runtime.DB.prepare(`INSERT INTO billing_orders
    (id, order_no, tenant_id, plan_id, provider, billing_cycle, amount_cents, currency, status, provider_trade_no, payment_url,
     client_request_id, expires_at, created_by_member_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'monthly', ?, 'CNY', 'pending', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, orderNo, input.tenantId, target.id, provider, target.monthly_price_cents, checkout.providerTradeNo, checkout.paymentUrl, requestId, expiresAt, input.memberId, now.toISOString(), now.toISOString()).run();
  return { id, orderNo, status: "pending", amountCents: target.monthly_price_cents, provider, paymentUrl: checkout.paymentUrl, expiresAt, plan: { code: target.code, name: target.name } };
}

function serializeOrder(row: Record<string, unknown>) {
  return { id: row.id, orderNo: row.order_no, status: row.status, amountCents: Number(row.amount_cents), provider: row.provider, paymentUrl: row.payment_url, expiresAt: row.expires_at, paidAt: row.paid_at, fulfilledAt: row.fulfilled_at, createdAt: row.created_at, plan: row.plan_code ? { code: row.plan_code, name: row.plan_name } : undefined };
}

export async function listBillingOrders(tenantId: string) {
  const result = await getRuntime().DB.prepare(`SELECT o.id, o.order_no, o.status, o.amount_cents, o.provider, o.payment_url, o.expires_at,
    o.paid_at, o.fulfilled_at, o.created_at, p.code AS plan_code, p.name AS plan_name
    FROM billing_orders o JOIN plans p ON p.id = o.plan_id WHERE o.tenant_id = ? ORDER BY o.created_at DESC LIMIT 20`).bind(tenantId).all();
  return (result.results as Array<Record<string, unknown>>).map(serializeOrder);
}

export async function fulfillPaidOrder(orderNo: string, providerTradeNo: string, paidAt = new Date().toISOString(), expected?: { provider: string; amountCents: number }) {
  const runtime = getRuntime(); const order = await runtime.DB.prepare(`SELECT o.id, o.tenant_id, o.plan_id, o.status, o.amount_cents,
    o.provider, p.monthly_credits FROM billing_orders o JOIN plans p ON p.id = o.plan_id WHERE o.order_no = ? LIMIT 1`).bind(orderNo).first<{
      id: string; tenant_id: string; plan_id: string; status: string; amount_cents: number; provider: string; monthly_credits: number;
    }>();
  if (!order) throw new PublicApiError(404, "订单不存在。", "order_not_found");
  if (expected && (order.provider !== expected.provider || order.amount_cents !== expected.amountCents)) throw new PublicApiError(409, "支付渠道或金额与订单不一致。", "payment_mismatch");
  const fulfilled = await runtime.DB.prepare("SELECT id FROM order_fulfillments WHERE order_id = ?").bind(order.id).first<{ id: string }>();
  if (fulfilled) return { duplicate: true, orderId: order.id };
  if (!["pending", "paid"].includes(order.status)) throw new PublicApiError(409, `订单状态 ${order.status} 不能开通。`, "invalid_order_state");
  const current = await runtime.DB.prepare("SELECT id, expires_at FROM subscriptions WHERE tenant_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(order.tenant_id).first<{ id: string; expires_at: string | null }>();
  const now = new Date().toISOString(); const currentExpiry = current?.expires_at ? Date.parse(current.expires_at) : 0;
  const renewalBase = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now();
  const expiresAt = new Date(renewalBase + 31 * 86400000).toISOString();
  const subscriptionId = current?.id || `sub_${crypto.randomUUID().replaceAll("-", "")}`;
  const balance = await runtime.DB.prepare("SELECT credits_balance FROM tenants WHERE id = ?").bind(order.tenant_id).first<{ credits_balance: number }>();
  const balanceAfter = (balance?.credits_balance || 0) + order.monthly_credits;
  const statements = [
    runtime.DB.prepare(`INSERT INTO order_fulfillments (id, order_id, tenant_id, subscription_id, credits_granted, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'success', ?)`)
      .bind(`ful_${crypto.randomUUID().replaceAll("-", "")}`, order.id, order.tenant_id, subscriptionId, order.monthly_credits, now),
    runtime.DB.prepare("UPDATE billing_orders SET status = 'fulfilled', provider_trade_no = ?, paid_at = COALESCE(paid_at, ?), fulfilled_at = ?, updated_at = ? WHERE id = ?")
      .bind(providerTradeNo, paidAt, now, now, order.id),
    runtime.DB.prepare("UPDATE tenants SET credits_balance = credits_balance + ?, updated_at = ? WHERE id = ?")
      .bind(order.monthly_credits, now, order.tenant_id),
    runtime.DB.prepare("INSERT INTO credit_ledger (id, tenant_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, ?, ?, 'paid_subscription', ?, ?)")
      .bind(crypto.randomUUID(), order.tenant_id, order.monthly_credits, balanceAfter, order.id, now),
  ];
  if (current) statements.push(runtime.DB.prepare("UPDATE subscriptions SET plan_id = ?, source = 'paid_order', starts_at = ?, expires_at = ?, auto_renew = 0, updated_at = ? WHERE id = ? AND tenant_id = ?")
    .bind(order.plan_id, now, expiresAt, now, current.id, order.tenant_id));
  else statements.push(runtime.DB.prepare(`INSERT INTO subscriptions (id, tenant_id, plan_id, status, source, starts_at, expires_at, auto_renew, created_at, updated_at)
    VALUES (?, ?, ?, 'active', 'paid_order', ?, ?, 0, ?, ?)`)
    .bind(subscriptionId, order.tenant_id, order.plan_id, now, expiresAt, now, now));
  await runtime.DB.batch(statements);
  return { duplicate: false, orderId: order.id, subscriptionId, creditsGranted: order.monthly_credits };
}

export async function verifyPaymentCallback(input: { provider: string; rawBody: string; signature: string; timestamp: string }) {
  const config = await loadPaymentConfig("gateway");
  if (!config.details.callbackSecret) return false;
  const timestampNumber = Number(input.timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 600) return false;
  const expected = await hmacSha256(config.details.callbackSecret, `${input.timestamp}\n${input.provider}\n${input.rawBody}`);
  return constantTimeEqual(expected, input.signature.toLowerCase());
}

export type NormalizedPaymentCallback = {
  provider: Exclude<PaymentProvider, "sandbox">;
  eventId: string;
  eventType: "payment.succeeded" | "refund.succeeded";
  orderNo: string;
  tradeNo: string;
  occurredAt: string;
  amountCents: number;
  currency: "CNY";
  rawBody: string;
  signatureValid: boolean;
};

function callbackText(value: unknown, limit = 160) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function wechatV2Time(value: string) {
  if (!/^\d{14}$/.test(value)) return new Date().toISOString();
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function parsePaymentCallback(request: Request, provider: Exclude<PaymentProvider, "sandbox">): Promise<NormalizedPaymentCallback> {
  const rawBody = await request.text();
  if (provider === "gateway") {
    const signature = request.headers.get("x-knowflow-signature") || "";
    const timestamp = request.headers.get("x-knowflow-timestamp") || "";
    let body: Record<string, unknown>;
    try { body = JSON.parse(rawBody) as Record<string, unknown>; }
    catch { throw new PublicApiError(400, "支付回调不是有效 JSON。", "invalid_callback"); }
    const eventType = body.event_type === "refund.succeeded" ? "refund.succeeded" : body.event_type === "payment.succeeded" ? "payment.succeeded" : null;
    const amountCents = Number(body.amount); const currency = callbackText(body.currency, 8).toUpperCase();
    if (!eventType || !callbackText(body.event_id) || !callbackText(body.order_no, 80) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== "CNY") {
      throw new PublicApiError(400, "支付回调字段不完整。", "invalid_callback");
    }
    return {
      provider, rawBody, eventType, amountCents, currency: "CNY",
      eventId: callbackText(body.event_id), orderNo: callbackText(body.order_no, 80),
      tradeNo: callbackText(body.trade_no) || callbackText(body.event_id),
      occurredAt: callbackText(body.paid_at) || new Date().toISOString(),
      signatureValid: await verifyPaymentCallback({ provider, rawBody, signature, timestamp }),
    };
  }
  if (provider === "alipay") {
    const config = await loadPaymentConfig("alipay"); const parameters = new URLSearchParams(rawBody);
    const values: Record<string, string> = {}; parameters.forEach((value, key) => { values[key] = value; });
    const signatureValid = values.sign_type === "RSA2" && Boolean(values.sign) &&
      await rsaSha256Verify(alipayNotificationSignContent(values), values.sign || "", config.details.alipayPublicKey || "") &&
      (!values.app_id || values.app_id === config.merchantId);
    const status = values.trade_status; const eventType = status === "TRADE_SUCCESS" || status === "TRADE_FINISHED" ? "payment.succeeded" : null;
    const amountCents = yuanToCents(values.total_amount || "");
    if (!eventType || !values.out_trade_no || !values.trade_no || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new PublicApiError(400, "支付宝回调字段或交易状态无效。", "invalid_callback");
    }
    return {
      provider, rawBody, eventType, signatureValid, amountCents, currency: "CNY",
      eventId: callbackText(values.notify_id || values.trade_no), orderNo: callbackText(values.out_trade_no, 80),
      tradeNo: callbackText(values.trade_no), occurredAt: callbackText(values.gmt_payment) || new Date().toISOString(),
    };
  }

  const config = await loadPaymentConfig("wechat");
  let values: Record<string, string>;
  try { values = wechatV2ParseXml(rawBody); }
  catch { throw new PublicApiError(400, "微信 V2 回调 XML 无法解析。", "invalid_callback"); }
  const amountCents = Number(values.total_fee || 0);
  const signatureValid = Boolean(config.details.apiV2Key) &&
    await wechatV2Verify(values, config.details.apiV2Key || "") &&
    values.appid === config.details.appId && values.mch_id === config.merchantId;
  const stateValid = values.return_code === "SUCCESS" && values.result_code === "SUCCESS";
  if (!stateValid || !values.out_trade_no || !values.transaction_id || !Number.isSafeInteger(amountCents) || amountCents <= 0 || (values.fee_type && values.fee_type !== "CNY")) {
    throw new PublicApiError(400, "微信 V2 回调字段或交易状态无效。", "invalid_callback");
  }
  return {
    provider: "wechat", rawBody, eventType: "payment.succeeded", signatureValid, amountCents, currency: "CNY",
    eventId: callbackText(values.transaction_id), orderNo: callbackText(values.out_trade_no, 80),
    tradeNo: callbackText(values.transaction_id), occurredAt: wechatV2Time(values.time_end || ""),
  };
}

export async function recordPaymentEvent(input: {
  provider: string; eventId: string; orderNo: string; eventType: string; rawBody: string; signatureValid: boolean;
}) {
  const runtime = getRuntime(); const now = new Date().toISOString(); const payloadHash = await sha256(input.rawBody);
  const existing = await runtime.DB.prepare("SELECT processing_status, signature_valid FROM payment_events WHERE provider = ? AND event_id = ?").bind(input.provider, input.eventId).first<{ processing_status: string; signature_valid: number }>();
  if (existing) {
    if (input.signatureValid && !existing.signature_valid) {
      await runtime.DB.prepare(`UPDATE payment_events SET order_no = ?, event_type = ?, signature_valid = 1, payload_hash = ?,
        processing_status = 'received', error_message = NULL, received_at = ?, processed_at = NULL WHERE provider = ? AND event_id = ?`)
        .bind(input.orderNo, input.eventType, payloadHash, now, input.provider, input.eventId).run();
      return { duplicate: false, recovered: true, status: "received" };
    }
    return { duplicate: true, status: existing.processing_status };
  }
  await runtime.DB.prepare(`INSERT INTO payment_events
    (id, provider, event_id, order_no, event_type, signature_valid, payload_hash, processing_status, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?)`)
    .bind(`evt_${crypto.randomUUID().replaceAll("-", "")}`, input.provider, input.eventId, input.orderNo, input.eventType, input.signatureValid ? 1 : 0, payloadHash, now).run();
  return { duplicate: false, status: "received" };
}

export async function finishPaymentEvent(provider: string, eventId: string, status: "processed" | "rejected" | "failed", error?: string) {
  await getRuntime().DB.prepare("UPDATE payment_events SET processing_status = ?, error_message = ?, processed_at = ? WHERE provider = ? AND event_id = ?")
    .bind(status, error || null, new Date().toISOString(), provider, eventId).run();
}

export async function processRefundedOrder(orderNo: string, providerRefundNo: string, expected?: { provider: string; amountCents: number }) {
  const runtime = getRuntime(); const order = await runtime.DB.prepare(`SELECT o.id, o.tenant_id, o.status, f.credits_granted, f.subscription_id
    , o.provider, o.amount_cents, f.created_at AS fulfillment_created_at
    FROM billing_orders o JOIN order_fulfillments f ON f.order_id = o.id WHERE o.order_no = ? LIMIT 1`).bind(orderNo).first<{ id: string; tenant_id: string; status: string; credits_granted: number; subscription_id: string; provider: string; amount_cents: number; fulfillment_created_at: string }>();
  if (!order) throw new PublicApiError(404, "可退款订单不存在。", "order_not_found");
  if (expected && (order.provider !== expected.provider || order.amount_cents !== expected.amountCents)) throw new PublicApiError(409, "退款渠道或金额与原订单不一致。", "refund_mismatch");
  if (order.status === "refunded") return { duplicate: true };
  if (order.status !== "fulfilled") throw new PublicApiError(409, "订单当前不能退款。", "invalid_order_state");
  const now = new Date().toISOString(); const tenant = await runtime.DB.prepare("SELECT credits_balance FROM tenants WHERE id = ?").bind(order.tenant_id).first<{ credits_balance: number }>();
  const deduction = Math.min(tenant?.credits_balance || 0, order.credits_granted); const balanceAfter = Math.max(0, (tenant?.credits_balance || 0) - deduction);
  const newerOrder = await runtime.DB.prepare(`SELECT f.id FROM order_fulfillments f JOIN billing_orders o ON o.id = f.order_id
    WHERE f.tenant_id = ? AND f.created_at > ? AND o.status = 'fulfilled' LIMIT 1`).bind(order.tenant_id, order.fulfillment_created_at).first<{ id: string }>();
  const statements = [
    runtime.DB.prepare("UPDATE billing_orders SET status = 'refunded', updated_at = ? WHERE id = ?").bind(now, order.id),
    runtime.DB.prepare("UPDATE refund_requests SET status = 'refunded', provider_refund_no = ?, reviewed_at = ?, updated_at = ? WHERE order_id = ? AND status IN ('requested','approved','processing')").bind(providerRefundNo, now, now, order.id),
    runtime.DB.prepare("UPDATE tenants SET credits_balance = ?, updated_at = ? WHERE id = ?").bind(balanceAfter, now, order.tenant_id),
    runtime.DB.prepare("INSERT INTO credit_ledger (id, tenant_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, ?, ?, 'subscription_refund', ?, ?)").bind(crypto.randomUUID(), order.tenant_id, -deduction, balanceAfter, order.id, now),
  ];
  if (!newerOrder) statements.push(runtime.DB.prepare("UPDATE subscriptions SET plan_id = 'plan_free', source = 'refunded_order', expires_at = NULL, auto_renew = 0, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, order.subscription_id, order.tenant_id));
  await runtime.DB.batch(statements);
  return { duplicate: false, creditsDeducted: deduction, subscriptionDowngraded: !newerOrder };
}

export async function submitRefund(input: { refundId: string; orderNo: string; amountCents: number; reason: string; provider: PaymentProvider }) {
  const config = await loadPaymentConfig(input.provider);
  if (config.mode === "sandbox") return { submitted: false, sandbox: true };
  if (input.provider === "wechat") {
    throw new PublicApiError(501, "微信支付 V2 自动退款需要商户 API 证书和双向 TLS，请使用微信商户平台或独立的 V2 退款服务。", "wechat_v2_refund_requires_cert");
  }
  if (!config.refundUrl || !paymentConfigReady(config) || !config.merchantId) return { submitted: false, sandbox: false };
  const url = new URL(config.refundUrl); if (url.protocol !== "https:") throw new PublicApiError(503, "退款网关必须使用 HTTPS。");
  if (input.provider === "alipay") {
    const parameters: Record<string, string> = {
      app_id: config.merchantId, method: "alipay.trade.refund", format: "JSON", charset: "utf-8", sign_type: "RSA2",
      timestamp: chinaPaymentTimestamp(), version: "1.0",
      biz_content: JSON.stringify({ out_trade_no: input.orderNo, refund_amount: (input.amountCents / 100).toFixed(2), refund_reason: input.reason.slice(0, 256), out_request_no: input.refundId }),
    };
    parameters.sign = await rsaSha256Sign(alipayRequestSignContent(parameters), config.details.appPrivateKey || "");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: new URLSearchParams(parameters), signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({})) as { alipay_trade_refund_response?: { code?: string; msg?: string; sub_msg?: string; trade_no?: string } };
    const result = data.alipay_trade_refund_response;
    if (!response.ok || result?.code !== "10000") throw new PublicApiError(502, `支付宝退款失败：${result?.sub_msg || result?.msg || `HTTP ${response.status}`}`, "refund_gateway_error");
    return { submitted: true, sandbox: false, completed: true, providerRefundNo: result.trade_no || input.refundId };
  }
  const timestamp = Math.floor(Date.now() / 1000).toString(); const payload = JSON.stringify({ merchant_id: config.merchantId, refund_id: input.refundId, order_no: input.orderNo, amount: input.amountCents, currency: "CNY", reason: input.reason, timestamp });
  const signature = await hmacSha256(config.details.callbackSecret || "", `${timestamp}\nrefund\n${payload}`);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-KnowFlow-Timestamp": timestamp, "X-KnowFlow-Signature": signature }, body: payload, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new PublicApiError(502, `退款网关返回 HTTP ${response.status}。`, "refund_gateway_error");
  return { submitted: true, sandbox: false, completed: false };
}
