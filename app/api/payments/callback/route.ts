import { finishPaymentEvent, fulfillPaidOrder, parsePaymentCallback, paymentState, processRefundedOrder, recordPaymentEvent } from "../../../../lib/billing";
import { writePaymentLabLog } from "../../../../lib/payment-lab";
import type { PaymentProvider } from "../../../../lib/payment-config";

type CallbackProvider = Exclude<PaymentProvider, "sandbox">;

function reply(provider: CallbackProvider, success: boolean, status = success ? 200 : 400, duplicate = false) {
  if (provider === "alipay") return new Response(success ? "success" : "failure", { status, headers: { "Content-Type": "text/plain;charset=utf-8" } });
  if (provider === "wechat") return Response.json(success ? { code: "SUCCESS", message: duplicate ? "重复通知已处理" : "成功" } : { code: "FAIL", message: "通知处理失败" }, { status });
  return Response.json(success ? { code: "SUCCESS", duplicate } : { code: "PROCESSING_FAILED" }, { status });
}

export async function POST(request: Request) {
  const rawProvider = new URL(request.url).searchParams.get("provider") || "gateway";
  if (rawProvider !== "wechat" && rawProvider !== "alipay" && rawProvider !== "gateway") return Response.json({ code: "INVALID_PROVIDER" }, { status: 400 });
  const provider: CallbackProvider = rawProvider;
  const state = await paymentState();
  if (!state.channels.some((channel) => channel.provider === provider && channel.mode === "production" && channel.ready)) {
    await writePaymentLabLog({ direction: "callback", provider, eventType: "callback.rejected", status: "not_ready", message: "支付渠道未启用或配置不完整。" });
    return reply(provider, false, 503);
  }
  let payload: Awaited<ReturnType<typeof parsePaymentCallback>>;
  try { payload = await parsePaymentCallback(request, provider); }
  catch (error) {
    const message = error instanceof Error ? error.message : "invalid callback";
    console.error("[knowflow-payment] invalid callback", error);
    await writePaymentLabLog({ direction: "callback", provider, eventType: "callback.parse.failed", status: "failed", message });
    return reply(provider, false, 400);
  }
  await writePaymentLabLog({
    direction: "callback", provider, eventType: payload.eventType, orderNo: payload.orderNo,
    status: payload.signatureValid ? "verified" : "invalid_signature", message: "收到支付平台异步通知。",
    detail: { eventId: payload.eventId, amountCents: payload.amountCents, currency: payload.currency, signatureValid: payload.signatureValid, tradeNoPresent: Boolean(payload.tradeNo) },
  });
  const recorded = await recordPaymentEvent({ provider, eventId: payload.eventId, orderNo: payload.orderNo, eventType: payload.eventType, rawBody: payload.rawBody, signatureValid: payload.signatureValid });
  if (!payload.signatureValid) {
    if (!recorded.duplicate || recorded.status !== "processed") await finishPaymentEvent(provider, payload.eventId, "rejected", "invalid signature");
    await writePaymentLabLog({ direction: "callback", provider, eventType: "callback.signature.rejected", orderNo: payload.orderNo, status: "rejected", message: "回调验签失败，未更新订单。" });
    return reply(provider, false, 401);
  }
  if (recorded.duplicate && recorded.status === "processed") {
    await writePaymentLabLog({ direction: "callback", provider, eventType: "callback.duplicate", orderNo: payload.orderNo, status: "duplicate", message: "重复通知已按幂等规则忽略。" });
    return reply(provider, true, 200, true);
  }
  try {
    if (payload.eventType === "payment.succeeded") await fulfillPaidOrder(payload.orderNo, payload.tradeNo, payload.occurredAt, { provider, amountCents: payload.amountCents });
    else await processRefundedOrder(payload.orderNo, payload.tradeNo, { provider, amountCents: payload.amountCents });
    await finishPaymentEvent(provider, payload.eventId, "processed");
    await writePaymentLabLog({ direction: "callback", provider, eventType: `${payload.eventType}.processed`, orderNo: payload.orderNo, status: "processed", message: payload.eventType === "payment.succeeded" ? "支付确认完成，权益已按幂等规则发放。" : "退款确认完成，订单权益已同步。" });
    return reply(provider, true);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "processing failed";
    await finishPaymentEvent(provider, payload.eventId, "failed", message);
    await writePaymentLabLog({ direction: "callback", provider, eventType: `${payload.eventType}.failed`, orderNo: payload.orderNo, status: "failed", message });
    return reply(provider, false, 409);
  }
}
