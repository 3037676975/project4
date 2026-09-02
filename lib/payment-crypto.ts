const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const normalized = value.replace(/\s+/g, "");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pemBody(value: string, kind: "private" | "public") {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(kind === "private" ? "私钥不能为空。" : "公钥不能为空。");
  if (kind === "private" && /BEGIN RSA PRIVATE KEY/.test(trimmed)) {
    throw new Error("请使用 PKCS#8 私钥（BEGIN PRIVATE KEY），不支持 PKCS#1 格式。");
  }
  if (kind === "public" && /BEGIN CERTIFICATE/.test(trimmed)) {
    throw new Error("请填写支付平台公钥（BEGIN PUBLIC KEY），不要粘贴 X.509 证书。");
  }
  return trimmed.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
}

async function importPrivateKey(value: string) {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(pemBody(value, "private")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function importPublicKey(value: string) {
  return crypto.subtle.importKey(
    "spki",
    base64ToBytes(pemBody(value, "public")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function rsaSha256Sign(value: string, privateKey: string) {
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importPrivateKey(privateKey), encoder.encode(value));
  return bytesToBase64(new Uint8Array(signature));
}

export async function rsaSha256Verify(value: string, signature: string, publicKey: string) {
  try {
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", await importPublicKey(publicKey), base64ToBytes(signature), encoder.encode(value));
  } catch {
    return false;
  }
}

export async function validateRsaPrivateKey(value: string) {
  await importPrivateKey(value);
}

export async function validateRsaPublicKey(value: string) {
  await importPublicKey(value);
}

export function alipayRequestSignContent(parameters: Record<string, string>) {
  return Object.entries(parameters)
    .filter(([key, value]) => key !== "sign" && value !== "")
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function alipayNotificationSignContent(parameters: Record<string, string>) {
  return Object.entries(parameters)
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "")
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function chinaPaymentTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "00";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

export function yuanToCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : NaN;
}

export async function decryptWechatResource(resource: { ciphertext: string; nonce: string; associated_data?: string }, apiV3Key: string) {
  const keyBytes = encoder.encode(apiV3Key);
  if (keyBytes.byteLength !== 32) throw new Error("微信支付 APIv3 密钥必须正好 32 个 UTF-8 字节。");
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const algorithm: AesGcmParams = { name: "AES-GCM", iv: encoder.encode(resource.nonce), tagLength: 128 };
  if (resource.associated_data) algorithm.additionalData = encoder.encode(resource.associated_data);
  const plaintext = await crypto.subtle.decrypt(algorithm, key, base64ToBytes(resource.ciphertext));
  return decoder.decode(plaintext);
}
