import { loadPaymentConfig, paymentConfigReady } from "./payment-config";
import { getRuntime } from "./runtime";
import { createWechatV2NativeOrder } from "./wechat-v2";

export async function createConfiguredWechatV2NativeOrder(input: {
  orderNo: string;
  amountCents: number;
  description: string;
  notifyPath: string;
}) {
  const config = await loadPaymentConfig("wechat");
  if (!paymentConfigReady(config)) throw new Error("请先保存微信 AppID、商户号和 API V2 Key。");
  const base = (getRuntime().APP_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("APP_BASE_URL 尚未配置，无法生成微信支付回调地址。");
  const notifyUrl = `${base}${input.notifyPath.startsWith("/") ? input.notifyPath : `/${input.notifyPath}`}`;
  return createWechatV2NativeOrder({
    appId: config.details.appId || "",
    merchantId: config.merchantId,
    apiV2Key: config.details.apiV2Key || "",
    unifiedOrderUrl: config.checkoutUrl,
    orderQueryUrl: config.details.queryUrl || "https://api.mch.weixin.qq.com/pay/orderquery",
    notifyUrl,
    spbillCreateIp: config.details.spbillCreateIp || "",
  }, {
    orderNo: input.orderNo,
    amountCents: input.amountCents,
    description: input.description,
  });
}
