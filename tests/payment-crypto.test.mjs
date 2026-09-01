import assert from "node:assert/strict";
import test from "node:test";
import { alipaySignContent, decryptWechatResource, rsaSha256Sign, rsaSha256Verify, yuanToCents } from "../lib/payment-crypto.ts";

function pem(label, buffer) {
  const base64 = Buffer.from(buffer).toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}

test("Alipay RSA2 canonical text excludes sign fields and sorts keys", () => {
  assert.equal(alipaySignContent({ z: "last", sign: "ignore", sign_type: "RSA2", a: "first", empty: "" }), "a=first&z=last");
  assert.equal(yuanToCents("1"), 100);
  assert.equal(yuanToCents("10.09"), 1009);
  assert.equal(Number.isNaN(yuanToCents("1.009")), true);
});

test("payment RSA helpers sign and verify API payloads", async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const privateKey = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const publicKey = pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey));
  const signature = await rsaSha256Sign("merchant\norder-1\n", privateKey);
  assert.equal(await rsaSha256Verify("merchant\norder-1\n", signature, publicKey), true);
  assert.equal(await rsaSha256Verify("merchant\norder-2\n", signature, publicKey), false);
});

test("WeChat API v3 notification resources decrypt with AES-256-GCM", async () => {
  const encoder = new TextEncoder(); const keyText = "12345678901234567890123456789012";
  const key = await crypto.subtle.importKey("raw", encoder.encode(keyText), "AES-GCM", false, ["encrypt"]);
  const nonce = "paymentnonce"; const associatedData = "transaction"; const plaintext = JSON.stringify({ out_trade_no: "KF100", trade_state: "SUCCESS" });
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: encoder.encode(nonce), additionalData: encoder.encode(associatedData), tagLength: 128 }, key, encoder.encode(plaintext));
  const decoded = await decryptWechatResource({ ciphertext: Buffer.from(ciphertext).toString("base64"), nonce, associated_data: associatedData }, keyText);
  assert.deepEqual(JSON.parse(decoded), JSON.parse(plaintext));
});
