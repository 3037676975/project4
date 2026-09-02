import { loadPaymentConfig, paymentConfigReady } from "./payment-config";
import { alipaySignContent, chinaPaymentTimestamp, rsaSha256Sign, rsaSha256Verify } from "./payment-crypto";
import { queryPaymentProvider } from "./payment-lab";
import { getRuntime } from "./runtime";
import { createWechatV2NativeOrder } from "./wechat-v2";

export type PaymentTestProvider = "wechat" | "alipay";

export type PaymentTestOrder = {
  provider: PaymentTestProvider;
  orderNo: string;
  amountCents: number;
  payUrl: string;
  expiresAt: string;
  message: string;
};

function testOrderNo(provider: PaymentTestProvider) {
  const prefix = provider === "wechat" ? "KFTESTWX" : "KFTESTALI";
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
  return `${prefix}${time}${random}`.slice(0, 32);
}

function testCallbackUrl(provider: PaymentTestProvider) {
  const base = (getRuntime().APP_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("APP_BASE_URL 尚未配置，无法生成支付测试回调地址。");
  return `${base}/api/payments/test-callback?provider=${provider}`;
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

async function createAlipayTestOrder(orderNo: string): Promise<string> {
  const config = await loadPaymentConfig("alipay");
  if (!paymentConfigReady(config)) throw new Error("请先保存支付宝 AppID、应用私钥和支付宝公钥。");
  const responseKey = "alipay_trade_precreate_response";
  const parameters: Record<string, string> = {
    app_id: config.merchantId,
    method: "alipay.trade.precreate",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: chinaPaymentTimestamp(),
    version: "1.0",
    notify_url: testCallbackUrl("alipay"),
    biz_content: JSON.stringify({
      out_trade_no: orderNo,
      total_amount: "0.01",
      subject: "KnowFlow 支付宝支付测试",
      timeout_express: "5m",
    }),
  };
  parameters.sign = await rsaSha256Sign(alipaySignContent(parameters), config.details.appPrivateKey || "");
  const response = await fetch(config.checkoutUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8", Accept: "application/json" },
    body: new URLSearchParams(parameters).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`支付宝测试下单 HTTP ${response.status}`);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const payload = parsed[responseKey] as Record<string, unknown> | undefined;
  if (!payload) throw new Error("支付宝测试下单返回缺少业务响应。");
  const signedContent = extractJsonObject(raw, responseKey);
  const signature = typeof parsed.sign === "string" ? parsed.sign : "";
  const signatureValid = Boolean(signedContent && signature && await rsaSha256Verify(signedContent, signature, config.details.alipayPublicKey || ""));
  if (!signatureValid) throw new Error("支付宝测试下单响应验签失败，请检查支付宝公钥。");
  if (String(payload.code || "") !== "10000") throw new Error(String(payload.sub_msg || payload.msg || payload.sub_code || "支付宝测试下单失败"));
  const qrCode = typeof payload.qr_code === "string" ? payload.qr_code : "";
  if (!qrCode) throw new Error("支付宝下单成功但没有返回 qr_code。");
  return qrCode;
}

export async function createPaymentTestOrder(provider: PaymentTestProvider): Promise<PaymentTestOrder> {
  const orderNo = testOrderNo(provider);
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  if (provider === "wechat") {
    const config = await loadPaymentConfig("wechat");
    if (!paymentConfigReady(config)) throw new Error("请先保存微信 AppID、商户号和 API V2 Key。");
    const created = await createWechatV2NativeOrder({
      appId: config.details.appId || "",
      merchantId: config.merchantId,
      apiV2Key: config.details.apiV2Key || "",
      unifiedOrderUrl: config.checkoutUrl,
      orderQueryUrl: config.details.queryUrl || "https://api.mch.weixin.qq.com/pay/orderquery",
      notifyUrl: testCallbackUrl("wechat"),
      spbillCreateIp: config.details.spbillCreateIp || "",
    }, { orderNo, amountCents: 1, description: "KnowFlow 微信支付测试" });
    return { provider, orderNo, amountCents: 1, payUrl: created.codeUrl, expiresAt, message: "微信已返回真实 Native code_url。" };
  }
  const payUrl = await createAlipayTestOrder(orderNo);
  return { provider, orderNo, amountCents: 1, payUrl, expiresAt, message: "支付宝已返回真实 precreate qr_code。" };
}

export async function queryPaymentTestOrder(provider: PaymentTestProvider, orderNo: string) {
  const expectedPrefix = provider === "wechat" ? "KFTESTWX" : "KFTESTALI";
  if (!orderNo.startsWith(expectedPrefix) || orderNo.length > 32) throw new Error("测试订单号无效。");
  return queryPaymentProvider(orderNo, provider);
}
