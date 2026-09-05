import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { numericCode, sliderPositionMatches } from "../lib/auth-verification.ts";

test("slider validation accepts only a narrow server-side tolerance", () => {
  assert.equal(sliderPositionMatches(72, 68), true);
  assert.equal(sliderPositionMatches(72, 76), true);
  assert.equal(sliderPositionMatches(72, 77), false);
  assert.equal(sliderPositionMatches(72, Number.NaN), false);
});

test("email verification codes are numeric and respect the configured length", () => {
  for (const length of [4, 6, 8]) {
    const code = numericCode(length);
    assert.match(code, new RegExp(`^\\d{${length}}$`));
  }
});

test("the three login pages are fixed to their own role portal", async () => {
  const [platform, admin, workspace, client] = await Promise.all([
    readFile(new URL("../app/platform/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/login-client.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(platform, /portal="platform"/);
  assert.match(admin, /portal="admin"/);
  assert.match(workspace, /portal="workspace"/);
  assert.doesNotMatch(client, /setPortal|portal-tabs|href="\/platform\/login"|href="\/admin\/login"/);
});

test("email registration and code login both require the verification flow", async () => {
  const [login, register, codeRoute] = await Promise.all([
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/email-code/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(login, /consumeEmailCode/);
  assert.match(register, /consumeEmailCode/);
  assert.match(codeRoute, /issueEmailCode/);
});

test("system manual visibility and RAG application are independent switches", async () => {
  const [settings, rag, platform] = await Promise.all([
    readFile(new URL("../lib/platform-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/platform/platform-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(settings, /builtin_manual_visible/);
  assert.match(settings, /builtin_manual_applied/);
  assert.match(rag, /isBuiltinManualApplied/);
  assert.match(platform, /显示开关/);
  assert.match(platform, /应用开关/);
});

test("private OCR is local-only, really infers, and surfaces upload failures", async () => {
  const [cloud, upload, compose, provider, settings, paddle, health, testRoute] = await Promise.all([
    readFile(new URL("../lib/cloud-ocr.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.private.yml", import.meta.url), "utf8"),
    readFile(new URL("../lib/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../services/paddleocr/app/main.py", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/services/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/settings/test/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(upload, /recognitionMode/);
  assert.match(upload, /parseTenantOcr/);
  assert.match(upload, /本地 PaddleOCR 实际识别失败/);
  assert.match(upload, /usage telemetry failed after successful import/);
  assert.match(compose, /paddleocr:/);
  assert.match(compose, /PP-OCRv6_small_det/);
  assert.match(compose, /PP-OCRv6_small_rec/);
  assert.match(compose, /paddleocr:\s*\n\s*condition: service_healthy/);
  assert.match(provider, /if \(kind === "ocr"\) return localPaddleOcrConfig\(runtime\)/);
  assert.match(provider, /http:\/\/paddleocr:8002/);
  assert.match(settings, /OCR 已固定为服务器内置 PaddleOCR/);
  assert.match(paddle, /lifespan/);
  assert.match(paddle, /PaddleOCR model is not ready/);
  assert.match(paddle, /freeLocal/);
  assert.match(health, /PaddleOCR 本地免费 OCR/);
  assert.match(health, /localOcrMode: "paddleocr"/);
  assert.match(testRoute, /OCR_SMOKE_TEST_PNG_BASE64/);
  assert.match(testRoute, /\/v1\/parse/);
  assert.match(testRoute, /本地 PaddleOCR 实际识别成功/);

  assert.doesNotMatch(cloud, /aip\.baidubce\.com|ocr\.tencentcloudapi\.com|oauth\/2\.0\/token|RecognizeTableAccurateOCR/);
  assert.match(cloud, /OCR 已从 Project4 移除/);
});

test("superadmin enterprise entry repairs its own suspended workspace and overrides stale tenant selection", async () => {
  const [workspacePage, repair] = await Promise.all([
    readFile(new URL("../app/workspace/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/platform-workspace-repair.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspacePage, /repairPlatformWorkspace/);
  assert.match(workspacePage, /initialTenantId/);
  assert.match(repair, /UPDATE tenants SET status = 'active'/);
  assert.match(repair, /role = 'owner', status = 'active'/);
  assert.match(repair, /billing_email/);
  assert.doesNotMatch(repair, /UPDATE tenants SET status = 'active'.*WHERE status/s);
});
