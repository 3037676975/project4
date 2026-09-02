import { PublicApiError } from "./api-keys";
import { channelSupportsAmount, loadPaymentConfig, paymentConfigReady } from "./payment-config";
import { getRuntime } from "./runtime";
import { createWechatV2NativeOrder } from "./wechat-v2";

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `KF${date}${random[0].toString(36).toUpperCase()}${random[1].toString(36).toUpperCase()}`.slice(0, 32);
}

function serializeOrder(row: Record<string, unknown>) {
  return {
    id: row.id, orderNo: row.order_no, status: row.status, amountCents: Number(row.amount_cents), provider: row.provider,
    paymentUrl: row.payment_url, expiresAt: row.expires_at, paidAt: row.paid_at, fulfilledAt: row.fulfilled_at, createdAt: row.created_at,
    plan: row.plan_code ? { code: row.plan_code, name: row.plan_name } : undefined,
  };
}

export async function createWechatV2BillingOrder(input: {
  tenantId: string;
  memberId: string;
  planCode: string;
  clientRequestId?: string;
}) {
  const runtime = getRuntime();
  const config = await loadPaymentConfig("wechat");
  if (!paymentConfigReady(config)) throw new PublicApiError(503, "微信支付 V2 尚未完成全局配置。", "payment_not_configured");
  let appBase: URL;
  try { appBase = new URL(runtime.APP_BASE_URL || ""); }
  catch { throw new PublicApiError(503, "APP_BASE_URL 未配置，不能生成微信支付回调地址。", "payment_not_configured"); }
  if (appBase.protocol !== "https:") throw new PublicApiError(503, "微信正式收款要求 APP_BASE_URL 使用公网 HTTPS。", "payment_not_configured");

  const target = await runtime.DB.prepare("SELECT id, code, name, monthly_price_cents FROM plans WHERE code = ? AND active = 1")
    .bind(input.planCode).first<{ id: string; code: string; name: string; monthly_price_cents: number }>();
  if (!target || target.monthly_price_cents <= 0) throw new PublicApiError(400, "请选择有效的付费套餐。");
  if (!channelSupportsAmount(config, target.monthly_price_cents)) throw new PublicApiError(400, "订单金额不在微信支付允许的范围内。", "payment_amount_unsupported");

  const requestId = (input.clientRequestId || crypto.randomUUID()).slice(0, 100);
  const existing = await runtime.DB.prepare(`SELECT o.id, o.order_no, o.status, o.amount_cents, o.provider, o.payment_url, o.expires_at,
    o.paid_at, o.fulfilled_at, o.created_at, p.code AS plan_code, p.name AS plan_name
    FROM billing_orders o JOIN plans p ON p.id = o.plan_id WHERE o.tenant_id = ? AND o.client_request_id = ? LIMIT 1`)
    .bind(input.tenantId, requestId).first<Record<string, unknown>>();
  if (existing) return serializeOrder(existing);

  const orderNo = orderNumber();
  let checkout: Awaited<ReturnType<typeof createWechatV2NativeOrder>>;
  try {
    checkout = await createWechatV2NativeOrder({
      appId: config.details.appId || "",
      merchantId: config.merchantId,
      apiV2Key: config.details.apiV2Key || "",
      unifiedOrderUrl: config.checkoutUrl,
      orderQueryUrl: config.details.queryUrl || "https://api.mch.weixin.qq.com/pay/orderquery",
      notifyUrl: `${appBase.toString().replace(/\/$/, "")}/api/payments/callback?provider=wechat`,
      spbillCreateIp: config.details.spbillCreateIp || "",
    }, { orderNo, amountCents: target.monthly_price_cents, description: `KnowFlow ${target.name}月度订阅` });
  } catch (error) {
    throw new PublicApiError(502, error instanceof Error ? error.message : "微信 V2 下单失败。", "payment_gateway_error");
  }

  const now = new Date(); const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const id = `ord_${crypto.randomUUID().replaceAll("-", "")}`;
  await runtime.DB.prepare(`INSERT INTO billing_orders
    (id, order_no, tenant_id, plan_id, provider, billing_cycle, amount_cents, currency, status, provider_trade_no, payment_url,
     client_request_id, expires_at, created_by_member_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'wechat', 'monthly', ?, 'CNY', 'pending', NULL, ?, ?, ?, ?, ?, ?)`)
    .bind(id, orderNo, input.tenantId, target.id, target.monthly_price_cents, checkout.codeUrl, requestId, expiresAt, input.memberId, now.toISOString(), now.toISOString()).run();

  return {
    id, orderNo, status: "pending", amountCents: target.monthly_price_cents, provider: "wechat" as const,
    paymentUrl: checkout.codeUrl, expiresAt, plan: { code: target.code, name: target.name },
  };
}
