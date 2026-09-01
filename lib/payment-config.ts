import { decryptSecret } from "./crypto";
import { getRuntime } from "./runtime";

export type PaymentProvider = "sandbox" | "wechat" | "alipay" | "gateway";
export type PaymentMode = "disabled" | "sandbox" | "production";

export type PaymentDetails = {
  displayName?: string;
  sortOrder?: number;
  feeRateBps?: number;
  fixedFeeCents?: number;
  minAmountCents?: number;
  maxAmountCents?: number;
  callbackSecret?: string;
  appId?: string;
  merchantSerialNo?: string;
  apiV3Key?: string;
  merchantPrivateKey?: string;
  platformPublicKeyId?: string;
  platformPublicKey?: string;
  signType?: "RSA2";
  appPrivateKey?: string;
  alipayPublicKey?: string;
  returnUrl?: string;
};

export type PaymentConfig = {
  mode: PaymentMode;
  provider: PaymentProvider;
  merchantName: string;
  merchantId: string;
  checkoutUrl: string;
  refundUrl: string;
  details: PaymentDetails;
  source: "database" | "environment";
  status: string;
  secretHint: string | null;
  updatedAt: string | null;
};

type PaymentRow = {
  id: string;
  mode: string;
  provider: string;
  merchant_name: string;
  merchant_id: string;
  checkout_url: string;
  refund_url: string;
  callback_secret_ciphertext: string | null;
  callback_secret_iv: string | null;
  callback_secret_hint: string | null;
  status: string;
  updated_at: string;
};

export function validPaymentProvider(value: unknown): Exclude<PaymentProvider, "sandbox"> {
  return value === "wechat" || value === "alipay" ? value : "gateway";
}

export function validPaymentMode(value: unknown): PaymentMode {
  return value === "sandbox" || value === "production" ? value : "disabled";
}

function defaults(provider: Exclude<PaymentProvider, "sandbox">): PaymentDetails {
  return {
    displayName: provider === "wechat" ? "微信支付" : provider === "alipay" ? "支付宝" : "兼容支付网关",
    sortOrder: provider === "wechat" ? 1 : provider === "alipay" ? 2 : 9,
    feeRateBps: 0,
    fixedFeeCents: 0,
    minAmountCents: 0,
    maxAmountCents: 0,
    signType: "RSA2",
  };
}

function parseDetails(value: string, provider: Exclude<PaymentProvider, "sandbox">): PaymentDetails {
  if (!value) return defaults(provider);
  try {
    const parsed = JSON.parse(value) as PaymentDetails;
    if (parsed && typeof parsed === "object") return { ...defaults(provider), ...parsed };
  } catch {
    // Version 12 and earlier stored a single gateway HMAC secret instead of JSON.
  }
  return { ...defaults(provider), callbackSecret: value };
}

async function rowToConfig(row: PaymentRow): Promise<PaymentConfig> {
  const runtime = getRuntime();
  const provider = validPaymentProvider(row.provider);
  let plaintext = "";
  if (row.callback_secret_ciphertext && row.callback_secret_iv && runtime.CONFIG_ENCRYPTION_KEY) {
    try { plaintext = await decryptSecret(row.callback_secret_ciphertext, row.callback_secret_iv, runtime.CONFIG_ENCRYPTION_KEY); }
    catch { plaintext = ""; }
  }
  return {
    mode: validPaymentMode(row.mode),
    provider,
    merchantName: row.merchant_name,
    merchantId: row.merchant_id,
    checkoutUrl: row.checkout_url,
    refundUrl: row.refund_url,
    details: parseDetails(plaintext, provider),
    source: "database",
    status: row.status,
    secretHint: row.callback_secret_hint,
    updatedAt: row.updated_at,
  };
}

function environmentConfig(): PaymentConfig {
  const runtime = getRuntime();
  const mode = validPaymentMode(runtime.PAYMENT_MODE);
  const provider = validPaymentProvider(runtime.PAYMENT_PROVIDER);
  return {
    mode,
    provider: mode === "sandbox" ? "sandbox" : provider,
    merchantName: "环境变量商户",
    merchantId: runtime.PAYMENT_MERCHANT_ID || "",
    checkoutUrl: runtime.PAYMENT_CHECKOUT_URL || "",
    refundUrl: runtime.PAYMENT_REFUND_URL || "",
    details: { ...defaults(provider), callbackSecret: runtime.PAYMENT_CALLBACK_SECRET || "" },
    source: "environment",
    status: "active",
    secretHint: runtime.PAYMENT_CALLBACK_SECRET ? "环境变量已配置" : null,
    updatedAt: null,
  };
}

export async function loadPaymentConfigs() {
  const result = await getRuntime().DB.prepare(`SELECT id, mode, provider, merchant_name, merchant_id, checkout_url, refund_url,
    callback_secret_ciphertext, callback_secret_iv, callback_secret_hint, status, updated_at
    FROM platform_payment_configs WHERE id IN ('wechat','alipay','gateway','default') ORDER BY updated_at DESC`).all<PaymentRow>();
  const rows = result.results || [];
  const configs: PaymentConfig[] = [];
  for (const provider of ["wechat", "alipay", "gateway"] as const) {
    const row = rows.find((item) => item.id === provider) || rows.find((item) => item.id === "default" && validPaymentProvider(item.provider) === provider);
    if (row) configs.push(await rowToConfig(row));
  }
  if (!configs.length) configs.push(environmentConfig());
  return configs.sort((left, right) => Number(left.details.sortOrder || 0) - Number(right.details.sortOrder || 0));
}

export async function loadPaymentConfig(provider?: PaymentProvider) {
  const configs = await loadPaymentConfigs();
  if (!provider || provider === "sandbox") {
    const sandbox = configs.find((item) => item.mode === "sandbox");
    if (sandbox) return { ...sandbox, provider: "sandbox" as const };
    return configs.find((item) => item.mode === "production" && paymentConfigReady(item)) || configs[0];
  }
  return configs.find((item) => item.provider === provider) || {
    mode: "disabled" as const,
    provider,
    merchantName: "",
    merchantId: "",
    checkoutUrl: "",
    refundUrl: "",
    details: defaults(provider),
    source: "database" as const,
    status: "active",
    secretHint: null,
    updatedAt: null,
  };
}

export function paymentConfigReady(config: PaymentConfig) {
  if (config.mode === "sandbox") return true;
  if (config.mode !== "production" || config.status !== "active" || !config.merchantId || !config.checkoutUrl) return false;
  if (config.provider === "wechat") return Boolean(
    config.details.appId && config.details.merchantSerialNo && config.details.apiV3Key &&
    config.details.merchantPrivateKey && config.details.platformPublicKeyId && config.details.platformPublicKey,
  );
  if (config.provider === "alipay") return Boolean(config.details.appPrivateKey && config.details.alipayPublicKey);
  return Boolean(config.details.callbackSecret);
}

export function channelSupportsAmount(config: PaymentConfig, amountCents: number) {
  const minimum = Math.max(0, Number(config.details.minAmountCents || 0));
  const maximum = Math.max(0, Number(config.details.maxAmountCents || 0));
  return amountCents >= minimum && (!maximum || amountCents <= maximum);
}

export function publicPaymentChannel(config: PaymentConfig) {
  return {
    provider: config.provider,
    name: config.details.displayName || config.merchantName || config.provider,
    mode: config.mode,
    ready: paymentConfigReady(config),
    sortOrder: Number(config.details.sortOrder || 0),
    feeRateBps: Number(config.details.feeRateBps || 0),
    fixedFeeCents: Number(config.details.fixedFeeCents || 0),
    minAmountCents: Number(config.details.minAmountCents || 0),
    maxAmountCents: Number(config.details.maxAmountCents || 0),
  };
}
