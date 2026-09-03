import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("super administrators receive an owned editable test workspace", async () => {
  const [workspace, tenant, tenantApi, dashboard] = await Promise.all([
    read("app/workspace/page.tsx"),
    read("lib/tenant.ts"),
    read("app/api/tenant/route.ts"),
    read("app/dashboard.tsx"),
  ]);
  assert.match(workspace, /createTenantWorkspace\(\{ account, companyName: "KnowFlow 官方测试企业" \}\)/);
  assert.doesNotMatch(workspace, /SELECT id FROM tenants WHERE status = 'active'/);
  assert.doesNotMatch(tenant, /platformPreview|platform-preview:/);
  assert.doesNotMatch(tenantApi, /平台只读|platformPreview/);
  assert.doesNotMatch(dashboard, /超级管理员只读预览|platformPreview/);
});

test("public ticket submission reuses an active handoff ticket", async () => {
  const route = await read("app/api/public/ticket/route.ts");
  assert.match(route, /status IN \('open', 'processing'\)/);
  assert.match(route, /existing: true/);
  assert.match(route, /mode = 'human'/);
});
