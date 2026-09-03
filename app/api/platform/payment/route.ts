import { encryptSecret } from "../../../../lib/crypto";
import { paymentState } from "../../../../lib/billing";
import { loadPaymentConfig, paymentConfigReady, type PaymentConfig, type PaymentDetails, type PaymentProvider } from "../../../../lib/payment-config";
import { queryPaymentProvider, writePaymentLabLog } from "../../../../lib/payment-lab";
import { createPaymentTestOrder, queryPaymentTestOrder } from "../../../../lib/payment-test";
import { requirePlatformAdmin, platformRouteError, writePlatformAudit } from "../../../../lib/platform-admin";
import { getRuntime } from "../../../../lib/runtime";
import { hmacSha256 } from "../../../../lib/security";
import { probeWechatV2Config } from "../../../../lib/wechat-v2";

type ChannelProvider = Exclude<PaymentProvider, "sandbox">;

function text(value: unknown, limit = 10000) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function number(value: unknown, minimum = 0, maximum = 100_000_000) {
  const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : minimum;
}
function providerValue(value: unknown): ChannelProvider { return value === "wechat" || value === "alipay" ? value : "gateway"; }
function secureUrl(value: unknown, required = false) {
  const raw = text(value, 500); if (!raw && !required) return "";
  let url: URL; try { url = new URL(raw); } catch { throw Object.assign(new Error("支付接口地址格式无效。"), { status: 400 }); }
  if (url.protocol !== "https:") throw Object.assign(new Error("正式支付接口必须使用 HTTPS。"), { status: 400 });
  return url.toString();
}
function appUsesHttps() {
  try { return new URL(getRuntime().APP_BASE_URL || "").protocol === "https:"; }
  catch { return false; }
}
function callbackUrl(request: Request, provider: ChannelProvider) {
  const base = (getRuntime().APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${base}/api/payments/callback?provider=${provider}`;
}
function defaults(provider: ChannelProvider) {
  if (provider === "wechat") return { checkoutUrl: "https://api.mch.weixin.qq.com/pay/unifiedorder", refundUrl: "", queryUrl: "https://api.mch.weixin.qq.com/pay/orderquery" };
  if (provider === "alipay") return { checkoutUrl: "https://openapi.alipay.com/gateway.do", refundUrl: "https://openapi.alipay.com/gateway.do", queryUrl: "" };
  return { checkoutUrl: "", refundUrl: "", queryUrl: "" };
}
function validIpv4(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}
function automaticWechatIp(existing = "") {
  if (validIpv4(existing)) return existing;
  try {
    const hostname = new URL(getRuntime().APP_BASE_URL || "").hostname;
    if (validIpv4(hostname)) return hostname;
  } catch { /* noop */ }
  return "";
}
function publicConfig(request: Request, config: PaymentConfig) {
  const details = config.details;
  return {
    mode: config.mode, provider: config.provider, merchantName: config.merchantName, merchantId: config.merchantId,
    checkoutUrl: config.checkoutUrl, refundUrl: config.refundUrl, displayName: details.displayName || config.merchantName,
    sortOrder: Number(details.sortOrder || 0), feeRateBps: Number(details.feeRateBps || 0), fixedFeeCents: Number(details.fixedFeeCents || 0),
    minAmountCents: Number(details.minAmountCents || 0), maxAmountCents: Number(details.maxAmountCents || 0),
    appId: details.appId || "", signType: details.signType || (config.provider === "wechat" ? "HMAC-SHA256" : "RSA2"), returnUrl: details.returnUrl || "",
    wechatApiVersion: details.wechatApiVersion || (config.provider === "wechat" ? "v2" : ""), queryUrl: details.queryUrl || "", spbillCreateIp: details.spbillCreateIp || "",
    source: config.source, status: config.status, updatedAt: config.updatedAt, secretHint: config.secretHint,
    callbackUrl: callbackUrl(request, config.provider as ChannelProvider), ready: paymentConfigReady(config), callbackHttpsReady: appUsesHttps(),
    callbackSecretConfigured: Boolean(details.callbackSecret), apiV2KeyConfigured: Boolean(details.apiV2Key),
    appPrivateKeyConfigured: Boolean(details.appPrivateKey), alipayPublicKeyConfigured: Boolean(details.alipayPublicKey),
    merchantSerialNo: "", platformPublicKeyId: "", apiV3KeyConfigured: false, merchantPrivateKeyConfigured: false, platformPublicKeyConfigured: false,
  };
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request, ["super_admin"]);
    const configs = await Promise.all((["wechat", "alipay", "gateway"] as const).map(async (provider) => {
      const config = await loadPaymentConfig(provider); const preset = defaults(provider);
      return publicConfig(request, {
        ...config,
        checkoutUrl: config.checkoutUrl || preset.checkoutUrl,
        refundUrl: config.refundUrl || preset.refundUrl,
        details: {
          ...config.details,
          queryUrl: config.details.queryUrl || preset.queryUrl,
          spbillCreateIp: provider === "wechat" ? automaticWechatIp(config.details.spbillCreateIp || "") : config.details.spbillCreateIp,
        },
      });
    }));
    const state = await paymentState();
    return Response.json({ configs, ready: state.ready, preferredProvider: state.provider, callbackHttpsReady: appUsesHttps() });
  } catch (error) { return platformRouteError(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request, ["super_admin"]); const runtime = getRuntime();
    const body = await request.json() as Record<string, unknown>; const action = text(body.action, 30) || "save"; const provider = providerValue(body.provider);

    if (action === "test") {
      try {
        const config = await loadPaymentConfig(provider);
        if (provider === "wechat") {
          const appId = text(config.details.appId, 160); const apiV2Key = text(config.details.apiV2Key, 200); const orderQueryUrl = text(config.details.queryUrl, 500) || defaults("wechat").queryUrl;
          if (!appId || !config.merchantId || !apiV2Key) return Response.json({ error: "请先填写并保存 AppID、商户号和 API V2 Key。" }, { status: 409 });
          const probe = await probeWechatV2Config({ appId, merchantId: config.merchantId, apiV2Key, orderQueryUrl });
          if (!probe.ok) return Response.json({ error: probe.message, code: probe.code }, { status: 409 });
          await writePaymentLabLog({ direction: "query", provider, eventType: "config.connectivity.verified", status: "connected", message: "微信支付 V2 配置连通检测通过。", detail: { code: probe.code } });
          return Response.json({ ok: true, code: probe.code, connected: true, callbackHttpsReady: appUsesHttps(), message: appUsesHttps() ? "微信支付配置正常，配置、签名、网络和 HTTPS 回调均已就绪。" : "微信支付配置正常，AppID、商户号、API V2 Key、签名和服务器网络均已验证通过；当前是 HTTP，可继续生成测试二维码，正式上线回调建议绑定 HTTPS 域名。" });
        }
        if (provider === "alipay") {
          if (!paymentConfigReady(config)) return Response.json({ error: "请先填写并保存支付宝 AppID、应用私钥和支付宝公钥。" }, { status: 409 });
          const probeOrderNo = `KFCHECK${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(0, 32);
          const probe = await queryPaymentProvider(probeOrderNo, "alipay");
          if (!probe.signatureValid) return Response.json({ error: "支付宝响应验签失败，请检查支付宝公钥。" }, { status: 409 });
          await writePaymentLabLog({ direction: "query", provider, eventType: "config.connectivity.verified", status: "connected", message: "支付宝配置连通检测通过。" });
          return Response.json({ ok: true, connected: true, callbackHttpsReady: appUsesHttps(), message: appUsesHttps() ? "支付宝配置正常，AppID、应用私钥、支付宝公钥、签名、网络和 HTTPS 回调均已就绪。" : "支付宝配置正常，AppID、应用私钥、支付宝公钥、签名和服务器网络均已验证通过；当前是 HTTP，可继续生成测试二维码，正式上线回调建议绑定 HTTPS 域名。" });
        }
        if (!paymentConfigReady(config)) return Response.json({ error: "请先补齐该渠道的正式商户参数并保存。" }, { status: 409 });
        await hmacSha256(config.details.callbackSecret || "", `knowflow-payment-self-test\n${Date.now()}`);
        return Response.json({ ok: true, connected: true, message: `${config.details.displayName || config.merchantName || provider} 本地签名和必填参数校验通过。` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        await writePaymentLabLog({ direction: "query", provider, eventType: "config.connectivity.failed", status: "failed", message });
        return Response.json({ error: `${provider === "wechat" ? "微信支付" : provider === "alipay" ? "支付宝" : "支付网关"}检测失败：${message}` }, { status: 502 });
      }
    }

    if (action === "create_test_order") {
      if (provider !== "wechat" && provider !== "alipay") return Response.json({ error: "只有微信和支付宝支持测试二维码。" }, { status: 400 });
      try {
        const order = await createPaymentTestOrder(provider);
        await writePaymentLabLog({ direction: "request", provider, eventType: "test.order.created", orderNo: order.orderNo, status: "waiting", message: order.message, detail: { amountCents: order.amountCents, expiresAt: order.expiresAt } });
        return Response.json({ ok: true, order });
      } catch (error) {
        const message = error instanceof Error ? error.message : "测试订单创建失败";
        await writePaymentLabLog({ direction: "request", provider, eventType: "test.order.create.failed", status: "failed", message });
        return Response.json({ error: `${provider === "wechat" ? "微信" : "支付宝"}测试二维码生成失败：${message}` }, { status: 502 });
      }
    }

    if (action === "query_test_order") {
      if (provider !== "wechat" && provider !== "alipay") return Response.json({ error: "测试订单渠道无效。" }, { status: 400 });
      const orderNo = text(body.orderNo, 40);
      if (!orderNo) return Response.json({ error: "缺少测试订单号。" }, { status: 400 });
      try {
        const result = await queryPaymentTestOrder(provider, orderNo);
        await writePaymentLabLog({ direction: "query", provider, eventType: "test.order.queried", orderNo, status: result.paid ? "paid" : result.providerStatus, message: result.message, detail: { amountCents: result.amountCents, tradeNoPresent: Boolean(result.tradeNo) } });
        return Response.json({ ok: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "测试订单查询失败";
        return Response.json({ error: message }, { status: 502 });
      }
    }

    if (action !== "save") return Response.json({ error: "不支持的支付配置操作。" }, { status: 400 });
    const current = await loadPaymentConfig(provider); const existing = current.details; const preset = defaults(provider);
    const nativeProvider = provider === "wechat" || provider === "alipay";
    const mode = nativeProvider ? "production" : (body.mode === "sandbox" || body.mode === "production" ? body.mode : "disabled");
    const merchantName = provider === "wechat" ? "微信支付" : provider === "alipay" ? "支付宝" : text(body.merchantName, 80);
    const merchantId = text(body.merchantId, 160);
    const checkoutUrl = nativeProvider ? preset.checkoutUrl : secureUrl(body.checkoutUrl || preset.checkoutUrl, mode === "production");
    const refundUrl = provider === "wechat" ? "" : provider === "alipay" ? preset.refundUrl : secureUrl(body.refundUrl || preset.refundUrl);
    const nextSecret = (key: keyof PaymentDetails, limit = 10000) => text(body[key], limit) || text(existing[key], limit);
    const details: PaymentDetails = {
      displayName: provider === "wechat" ? "微信支付 V2" : provider === "alipay" ? "支付宝" : text(body.displayName, 80) || existing.displayName || "兼容支付网关",
      sortOrder: provider === "wechat" ? 1 : provider === "alipay" ? 2 : number(body.sortOrder, 0, 999),
      feeRateBps: nativeProvider ? 0 : number(body.feeRateBps, 0, 10000), fixedFeeCents: nativeProvider ? 0 : number(body.fixedFeeCents),
      minAmountCents: nativeProvider ? 0 : number(body.minAmountCents), maxAmountCents: nativeProvider ? 0 : number(body.maxAmountCents),
      callbackSecret: nativeProvider ? undefined : nextSecret("callbackSecret", 500),
      appId: provider === "wechat" ? (text(body.appId, 160) || existing.appId) : undefined,
      apiV2Key: provider === "wechat" ? nextSecret("apiV2Key", 200) : undefined,
      queryUrl: provider === "wechat" ? preset.queryUrl : undefined,
      spbillCreateIp: provider === "wechat" ? automaticWechatIp(existing.spbillCreateIp || "") : undefined,
      wechatApiVersion: provider === "wechat" ? "v2" : undefined,
      signType: provider === "wechat" ? "HMAC-SHA256" : "RSA2",
      appPrivateKey: provider === "alipay" ? nextSecret("appPrivateKey") : undefined,
      alipayPublicKey: provider === "alipay" ? nextSecret("alipayPublicKey") : undefined,
      returnUrl: provider === "alipay" ? existing.returnUrl || "" : provider === "gateway" ? (text(body.returnUrl, 500) ? secureUrl(body.returnUrl) : existing.returnUrl || "") : undefined,
    };
    const candidate: PaymentConfig = { mode, provider, merchantName, merchantId, checkoutUrl, refundUrl, details, source: "database", status: "active", secretHint: current.secretHint, updatedAt: current.updatedAt };
    if (mode === "production" && !paymentConfigReady(candidate)) return Response.json({ error: provider === "wechat" ? "微信只需要填写 AppID、商户号和 API V2 Key。" : provider === "alipay" ? "支付宝只需要填写 AppID、应用私钥和支付宝公钥。" : "正式收款需填写商户号、HTTPS 下单地址和回调签名密钥。" }, { status: 400 });
    if (!runtime.CONFIG_ENCRYPTION_KEY) return Response.json({ error: "缺少 CONFIG_ENCRYPTION_KEY，不能保存支付密钥。" }, { status: 503 });
    const encrypted = await encryptSecret(JSON.stringify(details), runtime.CONFIG_ENCRYPTION_KEY); const now = new Date().toISOString();
    const secretCount = [details.callbackSecret, details.apiV2Key, details.appPrivateKey, details.alipayPublicKey].filter(Boolean).length;
    const hint = secretCount ? `已保存 ${secretCount} 项密钥` : null;
    await runtime.DB.prepare(`INSERT INTO platform_payment_configs
      (id, mode, provider, merchant_name, merchant_id, checkout_url, refund_url, callback_secret_ciphertext, callback_secret_iv,
       callback_secret_hint, status, updated_by_admin_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, provider = excluded.provider, merchant_name = excluded.merchant_name,
       merchant_id = excluded.merchant_id, checkout_url = excluded.checkout_url, refund_url = excluded.refund_url,
       callback_secret_ciphertext = excluded.callback_secret_ciphertext, callback_secret_iv = excluded.callback_secret_iv,
       callback_secret_hint = excluded.callback_secret_hint, status = 'active', updated_by_admin_id = excluded.updated_by_admin_id, updated_at = excluded.updated_at`)
      .bind(provider, mode, provider, merchantName, merchantId, checkoutUrl, refundUrl, encrypted.ciphertext, encrypted.iv, hint, admin.id, now, now).run();
    await writePlatformAudit(admin, "payment.channel.updated", "payment_config", provider, { mode, provider, merchantName, merchantIdHint: merchantId ? `${merchantId.slice(0, 4)}…` : "", secretCount, checkoutConfigured: Boolean(checkoutUrl), refundConfigured: Boolean(refundUrl), wechatApiVersion: provider === "wechat" ? "v2" : undefined });
    const saved = await loadPaymentConfig(provider); const state = await paymentState();
    const message = provider === "wechat" ? "微信支付配置已保存，可以直接检测连通性或生成 ¥0.01 测试二维码。" : provider === "alipay" ? "支付宝配置已保存，可以直接检测连通性或生成 ¥0.01 测试二维码。" : paymentConfigReady(saved) ? `${saved.details.displayName || provider} 已保存并可用于收款。` : "渠道配置已保存，当前未启用正式收款。";
    return Response.json({ saved: true, ready: state.ready, config: publicConfig(request, saved), message });
  } catch (error) { return platformRouteError(error); }
}
