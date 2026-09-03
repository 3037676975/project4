import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decryptFeishuPayload, wechatSignature, xmlTag } from "../lib/channels.ts";
import { getIndustryTemplate, listIndustryTemplates } from "../lib/industry-templates.ts";

test("微信系回调签名使用字典序 SHA-1", async () => {
  const values = ["knowflow-token", "1712345678", "nonce-123", "encrypted-message"];
  const expected = createHash("sha1").update([...values].sort().join("")).digest("hex");
  assert.equal(await wechatSignature(values[0], values[1], values[2], values[3]), expected);
});

test("原生微信 XML 同时解析 CDATA 与普通文本", () => {
  const xml = "<xml><MsgType><![CDATA[text]]></MsgType><Content>保修&amp;售后</Content><FromUserName><![CDATA[user-1]]></FromUserName></xml>";
  assert.equal(xmlTag(xml, "MsgType"), "text");
  assert.equal(xmlTag(xml, "Content"), "保修&售后");
  assert.equal(xmlTag(xml, "FromUserName"), "user-1");
});

test("行业模板包含可发布配置、演示知识和标准测试题", () => {
  const templates = listIndustryTemplates();
  assert.equal(templates.length, 4);
  assert.equal(new Set(templates.map((item) => item.code)).size, templates.length);
  for (const item of templates) {
    assert.match(item.themeColor, /^#[0-9a-f]{6}$/i);
    assert.ok(item.demoText.length > 150);
    assert.ok(item.qualityCases.length >= 3);
  }
  assert.equal(getIndustryTemplate("trade_sales")?.brandName, "产品选型顾问");
  assert.equal(getIndustryTemplate("unknown"), null);
});

test("飞书 Encrypt Key 安全模式可以解密事件 JSON", async () => {
  const encryptKey = "knowflow-feishu-encrypt-key";
  const keyBytes = createHash("sha256").update(encryptKey).digest();
  const iv = Buffer.from("1234567890abcdef");
  const { createCipheriv } = await import("node:crypto");
  const cipher = createCipheriv("aes-256-cbc", keyBytes, iv);
  const encrypted = Buffer.concat([iv, cipher.update(JSON.stringify({ challenge: "native-ok", token: "verify" })), cipher.final()]).toString("base64");
  assert.deepEqual(await decryptFeishuPayload(encrypted, encryptKey), { challenge: "native-ok", token: "verify" });
});
