import { fulfillPaidOrder } from "../../../../lib/billing";
import { queryPaymentProvider, writePaymentLabLog } from "../../../../lib/payment-lab";
import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";

type LiveProvider = "wechat" | "alipay" | "gateway";

function orderView(row: Record<string, unknown>) {
  return {
    orderNo: row.order_no,
    provider: row.provider,
    status: row.status,
    amountCents: Number(row.amount_cents || 0),
    currency: row.currency,
    providerTradeNo: row.provider_trade_no,
    paymentUrl: row.payment_url,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    fulfilledAt: row.fulfilled_at,
    expiresAt: row.expires_at,
  };
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner"]);
    const orderNo = (new URL(request.url).searchParams.get("orderNo") || "").trim().slice(0, 80);
    if (!orderNo) return Response.json({ error: "缺少 orderNo。" }, { status: 400 });

    const { DB } = getRuntime();
    const order = await DB.prepare(`SELECT id, order_no, provider, status, amount_cents, currency, provider_trade_no, payment_url,
      created_at, paid_at, fulfilled_at, expires_at FROM billing_orders WHERE tenant_id = ? AND order_no = ? LIMIT 1`)
      .bind(context.tenantId, orderNo).first<Record<string, unknown>>();
    if (!order) return Response.json({ error: "订单不存在。" }, { status: 404 });

    const provider = String(order.provider) as LiveProvider | "sandbox";
    if (provider === "sandbox" || order.status === "fulfilled" || order.status === "refunded") {
      return Response.json({ order: orderView(order), synchronized: false, message: provider === "sandbox" ? "沙箱订单无需查询第三方。" : "订单已是终态，无需再次同步。" });
    }
    if (provider !== "wechat" && provider !== "alipay" && provider !== "gateway") {
      return Response.json({ order: orderView(order), synchronized: false, error: "订单支付渠道无效。" }, { status: 409 });
    }

    try {
      const remote = await queryPaymentProvider(orderNo, provider);
      await writePaymentLabLog({
        direction: "query", provider, eventType: "order.query", orderNo,
        status: remote.paid ? "paid" : remote.providerStatus.toLowerCase(), message: remote.message,
        detail: { providerStatus: remote.providerStatus, signatureValid: remote.signatureValid, amountCents: remote.amountCents, tradeNoPresent: Boolean(remote.tradeNo) },
      });

      if (remote.paid) {
        const localAmount = Number(order.amount_cents || 0);
        if (!remote.signatureValid || !remote.tradeNo || remote.amountCents !== localAmount) {
          await writePaymentLabLog({
            direction: "query", provider, eventType: "order.sync.rejected", orderNo, status: "rejected",
            message: "第三方订单查询结果未通过完整一致性校验，未发放权益。",
            detail: { signatureValid: remote.signatureValid, tradeNoPresent: Boolean(remote.tradeNo), remoteAmountCents: remote.amountCents, localAmountCents: localAmount },
          });
          return Response.json({ order: orderView(order), providerState: remote, synchronized: false, error: "第三方显示已支付，但验签/交易号/金额校验未全部通过，系统未自动开通。" }, { status: 409 });
        }
        await fulfillPaidOrder(orderNo, remote.tradeNo, remote.occurredAt || new Date().toISOString(), { provider, amountCents: localAmount });
        await writePaymentLabLog({ direction: "query", provider, eventType: "order.sync.fulfilled", orderNo, status: "processed", message: "主动查询确认付款，权益已按幂等规则发放。" });
      }

      const refreshed = await DB.prepare(`SELECT id, order_no, provider, status, amount_cents, currency, provider_trade_no, payment_url,
        created_at, paid_at, fulfilled_at, expires_at FROM billing_orders WHERE tenant_id = ? AND order_no = ? LIMIT 1`)
        .bind(context.tenantId, orderNo).first<Record<string, unknown>>();
      return Response.json({ order: orderView(refreshed || order), providerState: remote, synchronized: remote.paid });
    } catch (error) {
      const message = error instanceof Error ? error.message : "订单查询失败。";
      await writePaymentLabLog({ direction: "query", provider, eventType: "order.query.failed", orderNo, status: "failed", message });
      return Response.json({ order: orderView(order), synchronized: false, syncError: message }, { status: 502 });
    }
  } catch (error) { return routeError(error); }
}
