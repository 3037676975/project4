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

test("OCR supports scanned documents, tables and the local PaddleOCR service", async () => {
  const [cloud, upload, dashboard, compose, provider, paddle] = await Promise.all([
    readFile(new URL("../lib/cloud-ocr.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.private.yml", import.meta.url), "utf8"),
    readFile(new URL("../lib/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../services/paddleocr/app/main.py", import.meta.url), "utf8"),
  ]);
  assert.match(cloud, /RecognizeTableAccurateOCR/);
  assert.match(cloud, /rest\/2\.0\/ocr\/v1\/\$\{engine\}/);
  assert.match(cloud, /pdf_file/);
  assert.match(upload, /recognitionMode/);
  assert.match(dashboard, /表格结构化 OCR/);
  assert.match(compose, /paddleocr:/);
  assert.match(compose, /PP-OCRv6_small_det/);
  assert.match(compose, /PP-OCRv6_small_rec/);
  assert.match(provider, /LOCAL_OCR_MODE/);
  assert.match(provider, /http:\/\/paddleocr:8002/);
  assert.match(paddle, /PaddleOCR/);
  assert.match(paddle, /freeLocal/);
});

test("Tencent GeneralAccurateOCR never sends the removed DetectDirection parameter", async () => {
  const cloud = await readFile(new URL("../lib/cloud-ocr.ts", import.meta.url), "utf8");
  assert.doesNotMatch(cloud, /DetectDirection/);
  assert.match(cloud, /EnableDetectSplit/);
  assert.match(cloud, /ConfigID: "OCR"/);
});
