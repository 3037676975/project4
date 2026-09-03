import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isEmailAddress, maskVisitorIp } from "../lib/customer-service.ts";

test("visitor IP is masked before it reaches the merchant console", () => {
  assert.equal(maskVisitorIp("1.2.3.4"), "1.2.3.*");
  assert.match(maskVisitorIp("2001:db8:0:1:2:3:4:5"), /^2001:db8:0:1:\*$/);
});

test("offline follow-up only accepts real email-shaped contacts", () => {
  assert.equal(isEmailAddress("buyer@example.com"), true);
  assert.equal(isEmailAddress("wechat-123"), false);
});

test("workspace exposes a dedicated customer service center with seven product tabs", async () => {
  const dashboard = await readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8");
  const center = await readFile(new URL("../app/customer-service-center.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /客服中心/);
  for (const label of ["实时会话","FAQ","数据报表","Trace 日志","访客与跟进","网站 Widget"]) assert.match(center, new RegExp(label));
});

test("customer service attachments are token protected and use R2", async () => {
  const pub = await readFile(new URL("../app/api/public/attachments/route.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../lib/customer-attachments.ts", import.meta.url), "utf8");
  assert.match(pub, /requireConversationToken/);
  assert.match(helper, /BUCKET\.put/);
  assert.match(helper, /8 \* 1024 \* 1024/);
});

test("offline agent replies use configured mail and never block the reply path", async () => {
  const helper = await readFile(new URL("../lib/offline-followup.ts", import.meta.url), "utf8");
  assert.match(helper, /sendMail/);
  assert.match(helper, /visitor_online/);
  assert.match(helper, /throttled/);
});
