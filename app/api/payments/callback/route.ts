import { finishPaymentEvent, fulfillPaidOrder, parsePaymentCallback, paymentState, processRefundedOrder, recordPaymentEvent } from "../../../../lib/billing";
import { writePaymentLabLog } from "../../../../lib/payment-lab";
import { loadPaymentConfig, type PaymentProvider } from "../../../../lib/payment-config";
import { wechatV2ParseXml, wechatV2Verify } from "../../../../lib/wechat-v2";

type CallbackProvider = Exclude<PaymentProvider, "sandbox">;
type CallbackPayload = Awaited<ReturnType<typeof parsePaymentCallback>>;

function wechatXml(success: boolean, duplicate = false) {
  const code = success ? "SUCCESS" : "FAIL";
  const message = success ? (duplicate ? "DUPLICATE_OK" : "OK") : "SIGN_OR_ORDER_INVALID";
  return `<xml><return_code><![CDATA[${code}]]></return_code><return_msg><![CDATA[${message}]]></return_msg></xml>`;
}

function reply(provider: CallbackProvider, success: boolean, status = success ? 200 : 400, duplicate = false) {
  if (provider === "alipay") return new Response(success ? "success" : "failure", { status, headers: { "Content-Type": "text/plain;charset=utf-8" } });
  if (provider === "wechat") return new Response(wechatXml(success, duplicate), { status, headers: { "Content-Type": "text/xml;charset=utf-8", "Cache-Control": "no-store" } });
  return Response.json(success ? { code: "SUCCESS", duplicate } : { code: "PROCESSING_FAILED" }, { status });
}

function wechatTime(value: string) {
  if (!/^\d{14}$/.test(value)) return new Date().toISOString();
  const formatted = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
  const parsed = new Date(formatted); return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function parseWechatV2Callback(request: Request): Promise<CallbackPayload> {
  const rawBody = await request.text();
  const config = await loadPaymentConfig("wechat");
  const values = wechatV2ParseXml(rawBody);
  const amountCents = Number(values.total_fee || 0);
  const signatureValid = Boolean(config.details.apiV2Key) && await wechatV2Verify(values, config.details.apiV2Key || "") &&
    values.appid === config.details.appId && values.mch_id === config.merchantId;
  const stateValid = values.return_code === "SUCCESS" && values.result_code === "SUCCESS";
  if (!stateValid || !values.out_trade_no || !values.transaction_id || !Number.isSafeInteger(amountCents) || amountCents <= 0 || (values.fee_type && values.fee_type !== "CNY")) {
    throw new Error(`微信 V2 回调字段或交易状态无效：${values.err_code_des || values.err_code || values.return_msg || "UNKNOWN"}`);
  }
  return {
    provider: "wechat",
    eventId: values.transaction_id,
    eventType: "payment.succeeded",
    orderNo: values.out_trade_no.slice(0, 80),
    tradeNo: values.transaction_id.slice(0, 160),
    occurredAt: wechatTime(values.time_end || ""),
    amountCents,
    currency: "CNY",
    rawBody,
    signatureValid,
  };
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
  let payload: CallbackPayload;
  try { payload = provider === "wechat" ? await parseWechatV2Callback(request) : await parsePaymentCallback(request, provider); }
  catch (error) {
    const message = error instanceof Error ? error.message : "invalid callback";
    console.error("[knowflow-payment] invalid callback", error);
    await writePaymentLabLog({ direction: "callback", provider, eventType: "callback.parse.failed", status: "failed", message });
    return reply(provider, false, 400);
  }
  await writePaymentLabLog({
    direction: "callback", provider, eventType: payload.eventType, orderNo: payload.orderNo,
    status: payload.signatureValid ? "verified" : "invalid_signature", message: provider === "wechat" ? "收到微信支付 V2 XML 异步通知。" : "收到支付平台异步通知。",
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
