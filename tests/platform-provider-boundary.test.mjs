import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("model provider writes and connection tests require a super administrator", async () => {
  const settings = await readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8");
  const connectionTest = await readFile(new URL("../app/api/settings/test/route.ts", import.meta.url), "utf8");
  assert.match(settings, /requirePlatformAdmin\(request, \["super_admin"\]\)/);
  assert.match(connectionTest, /requirePlatformAdmin\(request, \["super_admin"\]\)/);
  assert.doesNotMatch(settings, /requireRole\(context, \["owner", "admin"\]\)/);
  assert.doesNotMatch(connectionTest, /requireRole\(context, \["owner", "admin"\]\)/);
});

test("enterprise workspace has no model credential configuration navigation", async () => {
  const dashboard = await readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8");
  const platform = await readFile(new URL("../app/platform/platform-dashboard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboard, /\["模型服务", "\d+"\]/);
  assert.match(dashboard, /平台模型已托管/);
  assert.match(platform, /label: "模型服务"/);
  assert.match(platform, /PlatformProviderSettings/);
});

test("runtime provider lookup prefers the platform configuration", async () => {
  const provider = await readFile(new URL("../lib/provider.ts", import.meta.url), "utf8");
  const platformLookup = provider.indexOf("FROM platform_provider_configs");
  const tenantLookup = provider.indexOf("FROM tenant_provider_configs");
  assert.ok(platformLookup >= 0);
  assert.ok(tenantLookup > platformLookup);
});
