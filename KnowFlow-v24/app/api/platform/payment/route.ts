import { encryptSecret } from "../../../../lib/crypto";
import { paymentState } from "../../../../lib/billing";
import { loadPaymentConfig, paymentConfigReady, type PaymentConfig, type PaymentDetails, type PaymentProvider } from "../../../../lib/payment-config";
import { validateRsaPrivateKey, validateRsaPublicKey } from "../../../../lib/payment-crypto";
import { requirePlatformAdmin, platformRouteError, writePlatformAudit } from "../../../../lib/platform-admin";
import { getRuntime } from "../../../../lib/runtime";
import { hmacSha256 } from "../../../../lib/security";

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
function callbackUrl(request: Request, provider: ChannelProvider) {
  const base = (getRuntime().APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${base}/api/payments/callback?provider=${provider}`;
}
function defaults(provider: ChannelProvider) {
  if (provider === "wechat") return { checkoutUrl: "https://api.mch.weixin.qq.com/v3/pay/transactions/native", refundUrl: "https://api.mch.weixin.qq.com/v3/refund/domestic/refunds" };
  if (provider === "alipay") return { checkoutUrl: "https://openapi.alipay.com/gateway.do", refundUrl: "https://openapi.alipay.com/gateway.do" };
  return { checkoutUrl: "", refundUrl: "" };
}
function publicConfig(request: Request, config: PaymentConfig) {
  const details = config.details;
  return {
    mode: config.mode, provider: config.provider, merchantName: config.merchantName, merchantId: config.merchantId,
    checkoutUrl: config.checkoutUrl, refundUrl: config.refundUrl, displayName: details.displayName || config.merchantName,
    sortOrder: Number(details.sortOrder || 0), feeRateBps: Number(details.feeRateBps || 0), fixedFeeCents: Number(details.fixedFeeCents || 0),
    minAmountCents: Number(details.minAmountCents || 0), maxAmountCents: Number(details.maxAmountCents || 0),
    appId: details.appId || "", merchantSerialNo: details.merchantSerialNo || "", platformPublicKeyId: details.platformPublicKeyId || "",
    signType: details.signType || "RSA2", returnUrl: details.returnUrl || "", source: config.source, status: config.status,
    updatedAt: config.updatedAt, secretHint: config.secretHint, callbackUrl: callbackUrl(request, config.provider as ChannelProvider), ready: paymentConfigReady(config),
    callbackSecretConfigured: Boolean(details.callbackSecret), apiV3KeyConfigured: Boolean(details.apiV3Key),
    merchantPrivateKeyConfigured: Boolean(details.merchantPrivateKey), platformPublicKeyConfigured: Boolean(details.platformPublicKey),
    appPrivateKeyConfigured: Boolean(details.appPrivateKey), alipayPublicKeyConfigured: Boolean(details.alipayPublicKey),
  };
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request, ["super_admin"]);
    const configs = await Promise.all((["wechat", "alipay", "gateway"] as const).map(async (provider) => {
      const config = await loadPaymentConfig(provider); const preset = defaults(provider);
      return publicConfig(request, { ...config, checkoutUrl: config.checkoutUrl || preset.checkoutUrl, refundUrl: config.refundUrl || preset.refundUrl });
    }));
    const state = await paymentState();
    return Response.json({ configs, ready: state.ready, preferredProvider: state.provider });
  } catch (error) { return platformRouteError(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request, ["super_admin"]); const runtime = getRuntime();
    const body = await request.json() as Record<string, unknown>; const action = text(body.action, 30) || "save"; const provider = providerValue(body.provider);
    if (action === "test") {
      const config = await loadPaymentConfig(provider);
      if (!paymentConfigReady(config)) return Response.json({ error: "请先补齐该渠道的正式商户参数并保存。" }, { status: 409 });
      if (provider === "wechat") {
        if (new TextEncoder().encode(config.details.apiV3Key || "").byteLength !== 32) return Response.json({ error: "微信 APIv3 密钥必须正好 32 个 UTF-8 字节。" }, { status: 409 });
        await validateRsaPrivateKey(config.details.merchantPrivateKey || ""); await validateRsaPublicKey(config.details.platformPublicKey || "");
      } else if (provider === "alipay") {
        await validateRsaPrivateKey(config.details.appPrivateKey || ""); await validateRsaPublicKey(config.details.alipayPublicKey || "");
      } else await hmacSha256(config.details.callbackSecret || "", `knowflow-payment-self-test\n${Date.now()}`);
      return Response.json({ ok: true, message: `${config.details.displayName || config.merchantName || provider} 本地签名、密钥格式和必填参数校验通过（未产生真实扣款）。` });
    }
    if (action !== "save") return Response.json({ error: "不支持的支付配置操作。" }, { status: 400 });
    const current = await loadPaymentConfig(provider); const existing = current.details; const preset = defaults(provider);
    const mode = body.mode === "sandbox" || body.mode === "production" ? body.mode : "disabled";
    const merchantName = text(body.merchantName, 80); const merchantId = text(body.merchantId, 160);
    const checkoutUrl = secureUrl(body.checkoutUrl || preset.checkoutUrl, mode === "production"); const refundUrl = secureUrl(body.refundUrl || preset.refundUrl);
    const nextSecret = (key: keyof PaymentDetails, limit = 10000) => text(body[key], limit) || text(existing[key], limit);
    const details: PaymentDetails = {
      displayName: text(body.displayName, 80) || existing.displayName || (provider === "wechat" ? "微信支付" : provider === "alipay" ? "支付宝" : "兼容支付网关"),
      sortOrder: number(body.sortOrder, 0, 999), feeRateBps: number(body.feeRateBps, 0, 10000), fixedFeeCents: number(body.fixedFeeCents),
      minAmountCents: number(body.minAmountCents), maxAmountCents: number(body.maxAmountCents), callbackSecret: nextSecret("callbackSecret", 500),
      appId: text(body.appId, 160) || existing.appId, merchantSerialNo: text(body.merchantSerialNo, 200) || existing.merchantSerialNo,
      apiV3Key: nextSecret("apiV3Key", 200), merchantPrivateKey: nextSecret("merchantPrivateKey"),
      platformPublicKeyId: text(body.platformPublicKeyId, 200) || existing.platformPublicKeyId, platformPublicKey: nextSecret("platformPublicKey"),
      signType: "RSA2", appPrivateKey: nextSecret("appPrivateKey"), alipayPublicKey: nextSecret("alipayPublicKey"),
      returnUrl: text(body.returnUrl, 500) ? secureUrl(body.returnUrl) : existing.returnUrl || "",
    };
    const candidate: PaymentConfig = { mode, provider, merchantName, merchantId, checkoutUrl, refundUrl, details, source: "database", status: "active", secretHint: current.secretHint, updatedAt: current.updatedAt };
    if (mode === "production" && !paymentConfigReady(candidate)) return Response.json({ error: provider === "wechat" ? "微信正式收款需填写 AppID、商户号、证书序列号、APIv3 密钥、商户私钥、平台公钥 ID 和平台公钥。" : provider === "alipay" ? "支付宝正式收款需填写 AppID、应用私钥和支付宝公钥。" : "正式收款需填写商户号、HTTPS 下单地址和回调签名密钥。" }, { status: 400 });
    if (!runtime.CONFIG_ENCRYPTION_KEY) return Response.json({ error: "缺少 CONFIG_ENCRYPTION_KEY，不能保存支付密钥。" }, { status: 503 });
    const encrypted = await encryptSecret(JSON.stringify(details), runtime.CONFIG_ENCRYPTION_KEY); const now = new Date().toISOString();
    const secretCount = [details.callbackSecret, details.apiV3Key, details.merchantPrivateKey, details.platformPublicKey, details.appPrivateKey, details.alipayPublicKey].filter(Boolean).length;
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
    await writePlatformAudit(admin, "payment.channel.updated", "payment_config", provider, { mode, provider, merchantName, merchantIdHint: merchantId ? `${merchantId.slice(0, 4)}…` : "", secretCount, checkoutConfigured: Boolean(checkoutUrl), refundConfigured: Boolean(refundUrl) });
    const saved = await loadPaymentConfig(provider); const state = await paymentState();
    return Response.json({ saved: true, ready: state.ready, config: publicConfig(request, saved), message: paymentConfigReady(saved) ? `${saved.details.displayName || provider} 已保存并可用于收款。` : "渠道配置已保存，当前未启用正式收款。" });
  } catch (error) { return platformRouteError(error); }
}
