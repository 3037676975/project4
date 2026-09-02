import { constantTimeEqual, hmacSha256 } from "./security";

export type WechatV2Fields = Record<string, string>;

export type WechatV2Config = {
  appId: string;
  merchantId: string;
  apiV2Key: string;
  unifiedOrderUrl: string;
  orderQueryUrl: string;
  notifyUrl: string;
  spbillCreateIp: string;
};

function nonce() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function clean(value: unknown, limit = 512) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function xmlDecode(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function wechatV2ParseXml(xml: string): WechatV2Fields {
  const source = xml.trim();
  if (!source.startsWith("<xml>") || !source.endsWith("</xml>") || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("微信支付 V2 返回 XML 无效。");
  const result: WechatV2Fields = {};
  const expression = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source))) result[match[1]] = xmlDecode(match[2] ?? match[3] ?? "");
  if (!Object.keys(result).length) throw new Error("微信支付 V2 XML 没有可解析字段。");
  return result;
}

export function wechatV2ToXml(fields: WechatV2Fields) {
  const body = Object.entries(fields).map(([key, value]) => {
    if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error("微信支付 V2 XML 字段名无效。");
    return `<${key}><![CDATA[${String(value).replace(/\]\]>/g, "]] ]><![CDATA[>")}]]></${key}>`;
  }).join("");
  return `<xml>${body}</xml>`;
}

export async function wechatV2Sign(fields: WechatV2Fields, apiV2Key: string) {
  if (!apiV2Key.trim()) throw new Error("微信支付 API V2 Key 不能为空。");
  const canonical = Object.entries(fields)
    .filter(([key, value]) => key !== "sign" && value !== "")
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, value]) => `${key}=${value}`)
    .concat(`key=${apiV2Key.trim()}`)
    .join("&");
  return (await hmacSha256(apiV2Key.trim(), canonical)).toUpperCase();
}

export async function wechatV2Verify(fields: WechatV2Fields, apiV2Key: string) {
  const received = clean(fields.sign, 128).toUpperCase();
  if (!received) return false;
  const expected = await wechatV2Sign(fields, apiV2Key);
  return constantTimeEqual(received, expected);
}

export async function postWechatV2(url: string, fields: WechatV2Fields, apiV2Key: string) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:") throw new Error("微信支付 V2 接口必须使用 HTTPS。");
  const signed = { ...fields, sign_type: "HMAC-SHA256" };
  signed.sign = await wechatV2Sign(signed, apiV2Key);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", Accept: "text/xml, application/xml" },
    body: wechatV2ToXml(signed),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`微信支付 V2 网关 HTTP ${response.status}`);
  const data = wechatV2ParseXml(raw);
  const signatureValid = data.sign ? await wechatV2Verify(data, apiV2Key) : false;
  return { data, raw, signatureValid };
}

export async function createWechatV2NativeOrder(config: WechatV2Config, input: { orderNo: string; amountCents: number; description: string }) {
  const result = await postWechatV2(config.unifiedOrderUrl, {
    appid: config.appId,
    mch_id: config.merchantId,
    nonce_str: nonce(),
    body: input.description.slice(0, 80) || "KnowFlow 订单",
    out_trade_no: input.orderNo,
    total_fee: String(input.amountCents),
    spbill_create_ip: config.spbillCreateIp,
    notify_url: config.notifyUrl,
    trade_type: "NATIVE",
  }, config.apiV2Key);
  const data = result.data;
  if (data.return_code !== "SUCCESS") throw new Error(`微信 V2 通信失败：${data.return_msg || "UNKNOWN"}`);
  if (data.result_code !== "SUCCESS") throw new Error(`微信 V2 下单失败：${data.err_code_des || data.err_code || "UNKNOWN"}`);
  if (!result.signatureValid) throw new Error("微信 V2 下单响应验签失败。");
  if (!data.code_url) throw new Error("微信 V2 下单成功但没有返回 code_url。");
  return { codeUrl: data.code_url, prepayId: data.prepay_id || null };
}

export async function queryWechatV2Order(config: Pick<WechatV2Config, "appId" | "merchantId" | "apiV2Key" | "orderQueryUrl">, orderNo: string) {
  const result = await postWechatV2(config.orderQueryUrl, {
    appid: config.appId,
    mch_id: config.merchantId,
    nonce_str: nonce(),
    out_trade_no: orderNo,
  }, config.apiV2Key);
  return result;
}

export async function probeWechatV2Config(config: Pick<WechatV2Config, "appId" | "merchantId" | "apiV2Key" | "orderQueryUrl">) {
  const probeOrderNo = `KFCHECK${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(0, 32);
  const { data, signatureValid } = await queryWechatV2Order(config, probeOrderNo);
  const errorCode = data.err_code || "";
  if (data.return_code !== "SUCCESS") {
    return { ok: false, code: data.return_code || "COMMUNICATION_FAIL", message: data.return_msg || "微信支付通信失败", signatureValid };
  }
  if (data.result_code === "FAIL" && errorCode === "ORDERNOTEXIST") {
    return { ok: true, code: "ORDERNOTEXIST", message: "微信 V2 全局配置已连通：AppID、商户号、API V2 Key、签名和订单查询接口均验证通过。", signatureValid };
  }
  if (data.result_code === "FAIL") {
    const messages: Record<string, string> = {
      SIGNERROR: "签名错误：请检查 API V2 Key。",
      APPID_NOT_EXIST: "AppID 不存在，请检查 AppID。",
      MCHID_NOT_EXIST: "商户号不存在，请检查 mch_id。",
      APPID_MCHID_NOT_MATCH: "AppID 与商户号不匹配。",
      REQUIRE_POST_METHOD: "微信接口请求方式异常。",
    };
    return { ok: false, code: errorCode || "V2_CONFIG_ERROR", message: messages[errorCode] || data.err_code_des || errorCode || "微信 V2 配置检查失败。", signatureValid };
  }
  return { ok: true, code: data.trade_state || "SUCCESS", message: "微信 V2 订单查询接口已连通。", signatureValid };
}
