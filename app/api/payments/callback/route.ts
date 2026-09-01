import { finishPaymentEvent, fulfillPaidOrder, parsePaymentCallback, paymentState, processRefundedOrder, recordPaymentEvent } from "../../../../lib/billing";
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
  if (!state.channels.some((channel) => channel.provider === provider && channel.mode === "production" && channel.ready)) return reply(provider, false, 503);
  let payload: Awaited<ReturnType<typeof parsePaymentCallback>>;
  try { payload = await parsePaymentCallback(request, provider); }
  catch (error) { console.error("[knowflow-payment] invalid callback", error); return reply(provider, false, 400); }
  const recorded = await recordPaymentEvent({ provider, eventId: payload.eventId, orderNo: payload.orderNo, eventType: payload.eventType, rawBody: payload.rawBody, signatureValid: payload.signatureValid });
  if (!payload.signatureValid) {
    if (!recorded.duplicate || recorded.status !== "processed") await finishPaymentEvent(provider, payload.eventId, "rejected", "invalid signature");
    return reply(provider, false, 401);
  }
  if (recorded.duplicate && recorded.status === "processed") return reply(provider, true, 200, true);
  try {
    if (payload.eventType === "payment.succeeded") await fulfillPaidOrder(payload.orderNo, payload.tradeNo, payload.occurredAt, { provider, amountCents: payload.amountCents });
    else await processRefundedOrder(payload.orderNo, payload.tradeNo, { provider, amountCents: payload.amountCents });
    await finishPaymentEvent(provider, payload.eventId, "processed");
    return reply(provider, true);
  } catch (error) {
    await finishPaymentEvent(provider, payload.eventId, "failed", error instanceof Error ? error.message.slice(0, 500) : "processing failed");
    return reply(provider, false, 409);
  }
}
