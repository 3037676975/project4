import { createBillingOrder, fulfillPaidOrder, listBillingOrders, paymentState, processRefundedOrder, submitRefund } from "../../../lib/billing";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime(); const month = new Date().toISOString().slice(0, 7); const payment = await paymentState();
    const [plans, subscription, usage, counts, orders, refunds] = await Promise.all([
      DB.prepare("SELECT id, code, name, monthly_price_cents, request_quota, token_quota, storage_quota_bytes, monthly_credits, api_key_limit, member_limit, widget_conversation_quota, lead_quota, features_json FROM plans WHERE active = 1 ORDER BY monthly_price_cents").all(),
      DB.prepare(`SELECT s.id, s.status, s.source, s.starts_at, s.expires_at, s.auto_renew, p.id AS plan_id, p.code, p.name
        FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1`).bind(context.tenantId).first<Record<string, unknown>>(),
      DB.prepare("SELECT request_count, token_count, credits_used FROM tenant_usage_monthly WHERE id = ?").bind(`${context.tenantId}:${month}`).first<Record<string, number>>(),
      DB.prepare(`SELECT (SELECT COUNT(*) FROM customer_api_keys WHERE tenant_id = ? AND revoked_at IS NULL) AS api_keys,
        (SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ? AND status = 'active') AS members,
        (SELECT COALESCE(SUM(char_count * 2), 0) FROM knowledge_documents WHERE tenant_id = ?) AS storage_bytes,
        (SELECT credits_balance FROM tenants WHERE id = ?) AS credits_balance`).bind(context.tenantId, context.tenantId, context.tenantId, context.tenantId).first<Record<string, number>>(),
      listBillingOrders(context.tenantId),
      DB.prepare(`SELECT r.id, r.amount_cents, r.reason, r.status, r.created_at, o.order_no
        FROM refund_requests r JOIN billing_orders o ON o.id = r.order_id WHERE r.tenant_id = ? ORDER BY r.created_at DESC LIMIT 20`).bind(context.tenantId).all(),
    ]);
    return Response.json({
      payment, orders, refunds: (refunds.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, orderNo: row.order_no, amountCents: row.amount_cents, reason: row.reason, status: row.status, createdAt: row.created_at })),
      plans: (plans.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, code: row.code, name: row.name, monthlyPriceCents: row.monthly_price_cents, requestQuota: row.request_quota, tokenQuota: row.token_quota, storageQuotaBytes: row.storage_quota_bytes, monthlyCredits: row.monthly_credits, apiKeyLimit: row.api_key_limit, memberLimit: row.member_limit, widgetConversationQuota: row.widget_conversation_quota, leadQuota: row.lead_quota, features: JSON.parse(String(row.features_json)) })),
      subscription: subscription ? { id: subscription.id, status: subscription.status, source: subscription.source, startsAt: subscription.starts_at, expiresAt: subscription.expires_at, autoRenew: Boolean(subscription.auto_renew), plan: { id: subscription.plan_id, code: subscription.code, name: subscription.name } } : null,
      usage: { month, requests: usage?.request_count ?? 0, tokens: usage?.token_count ?? 0, creditsUsed: usage?.credits_used ?? 0, apiKeys: counts?.api_keys ?? 0, members: counts?.members ?? 0, storageBytes: counts?.storage_bytes ?? 0, creditsBalance: counts?.credits_balance ?? 0 },
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner"]);
    const body = await request.json() as Record<string, unknown>; const action = String(body.action || "create_order"); const { DB } = getRuntime(); const payment = await paymentState();
    if (action === "create_order" || action === "renew") {
      const order = await createBillingOrder({ tenantId: context.tenantId, memberId: context.memberId,
        planCode: typeof body.planCode === "string" ? body.planCode : "", requestedProvider: typeof body.provider === "string" ? body.provider : payment.provider,
        clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : undefined });
      return Response.json({ order }, { status: 201 });
    }
    if (action === "sandbox_confirm") {
      if (payment.mode !== "sandbox") return Response.json({ error: "仅本地沙箱环境允许模拟付款，生产环境已禁用。" }, { status: 403 });
      const orderNo = typeof body.orderNo === "string" ? body.orderNo : "";
      const owned = await DB.prepare("SELECT order_no FROM billing_orders WHERE tenant_id = ? AND order_no = ? AND provider = 'sandbox'").bind(context.tenantId, orderNo).first<{ order_no: string }>();
      if (!owned) return Response.json({ error: "沙箱订单不存在。" }, { status: 404 });
      const result = await fulfillPaidOrder(orderNo, `sandbox_${crypto.randomUUID()}`);
      return Response.json({ paid: true, ...result });
    }
    if (action === "cancel_renewal") {
      await DB.prepare("UPDATE subscriptions SET auto_renew = 0, updated_at = ? WHERE tenant_id = ? AND status = 'active'").bind(new Date().toISOString(), context.tenantId).run();
      return Response.json({ saved: true, message: "自动续费已关闭；当前套餐有效期不受影响。" });
    }
    if (action === "request_refund") {
      const orderNo = typeof body.orderNo === "string" ? body.orderNo : "";
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      const order = await DB.prepare("SELECT id, amount_cents, status, provider FROM billing_orders WHERE tenant_id = ? AND order_no = ?").bind(context.tenantId, orderNo).first<{ id: string; amount_cents: number; status: string; provider: "sandbox" | "wechat" | "alipay" | "gateway" }>();
      if (!order || order.status !== "fulfilled") return Response.json({ error: "只有已付款并开通的订单可以申请退款。" }, { status: 409 });
      if (!reason) return Response.json({ error: "请填写退款原因。" }, { status: 400 });
      const existingRefund = await DB.prepare("SELECT id, status FROM refund_requests WHERE tenant_id = ? AND order_id = ? AND status IN ('requested','approved','processing','refunded') ORDER BY created_at DESC LIMIT 1").bind(context.tenantId, order.id).first<{ id: string; status: string }>();
      if (existingRefund) return Response.json({ error: `该订单已有退款申请（${existingRefund.status}），不能重复提交。`, refundId: existingRefund.id }, { status: 409 });
      const now = new Date().toISOString(); const id = `refund_${crypto.randomUUID().replaceAll("-", "")}`;
      await DB.prepare(`INSERT INTO refund_requests
        (id, order_id, tenant_id, amount_cents, reason, status, requested_by_member_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?)`)
        .bind(id, order.id, context.tenantId, order.amount_cents, reason, context.memberId, now, now).run();
      let submitted: Awaited<ReturnType<typeof submitRefund>>;
      try { submitted = await submitRefund({ refundId: id, orderNo, amountCents: order.amount_cents, reason, provider: order.provider }); }
      catch (error) { await DB.prepare("UPDATE refund_requests SET status = 'failed', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run(); throw error; }
      if (submitted.sandbox) {
        await processRefundedOrder(orderNo, `sandbox_refund_${crypto.randomUUID()}`);
        return Response.json({ saved: true, refund: { id, orderNo, amountCents: order.amount_cents, status: "refunded" } }, { status: 201 });
      }
      if (submitted.completed) {
        await processRefundedOrder(orderNo, submitted.providerRefundNo || id, { provider: order.provider, amountCents: order.amount_cents });
        return Response.json({ saved: true, refund: { id, orderNo, amountCents: order.amount_cents, status: "refunded" } }, { status: 201 });
      }
      if (submitted.submitted) await DB.prepare("UPDATE refund_requests SET status = 'processing', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
      return Response.json({ saved: true, refund: { id, orderNo, amountCents: order.amount_cents, status: submitted.submitted ? "processing" : "requested" } }, { status: 201 });
    }
    if (action === "sandbox_refund") {
      if (payment.mode !== "sandbox") return Response.json({ error: "仅沙箱环境允许模拟退款。" }, { status: 403 });
      const orderNo = typeof body.orderNo === "string" ? body.orderNo : ""; const result = await processRefundedOrder(orderNo, `sandbox_refund_${crypto.randomUUID()}`); return Response.json({ refunded: true, ...result });
    }
    return Response.json({ error: "不支持的账单操作。" }, { status: 400 });
  } catch (error) { return routeError(error); }
}
