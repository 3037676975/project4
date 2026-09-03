import { parsePaymentCallback } from "../../../../lib/billing";
import { writePaymentLabLog } from "../../../../lib/payment-lab";

function wechatReply(ok: boolean, message = "OK") {
  const code = ok ? "SUCCESS" : "FAIL";
  return new Response(`<xml><return_code><![CDATA[${code}]]></return_code><return_msg><![CDATA[${message.slice(0, 120)}]]></return_msg></xml>`, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  if (provider !== "wechat" && provider !== "alipay") return Response.json({ error: "不支持的测试支付渠道。" }, { status: 400 });
  try {
    const parsed = await parsePaymentCallback(request, provider);
    if (!parsed.signatureValid) {
      await writePaymentLabLog({ direction: "callback", provider, eventType: "test.payment.callback.rejected", orderNo: parsed.orderNo, status: "rejected", message: "测试支付回调验签失败。" });
      return provider === "wechat" ? wechatReply(false, "SIGNATURE_INVALID") : new Response("fail", { status: 400 });
    }
    await writePaymentLabLog({
      direction: "callback", provider, eventType: "test.payment.callback.verified", orderNo: parsed.orderNo,
      status: parsed.eventType === "payment.succeeded" ? "paid" : "received",
      message: "Payment Lab 测试回调已验签；测试订单不会触发套餐履约。",
      detail: { tradeNo: parsed.tradeNo, amountCents: parsed.amountCents, eventType: parsed.eventType },
    });
    return provider === "wechat" ? wechatReply(true) : new Response("success", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "测试回调处理失败";
    await writePaymentLabLog({ direction: "callback", provider, eventType: "test.payment.callback.failed", status: "failed", message });
    return provider === "wechat" ? wechatReply(false, message) : new Response("fail", { status: 400 });
  }
}
