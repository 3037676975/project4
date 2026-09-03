import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("live inbox exposes mature queue, unread, search, assignment and visitor profile controls", async () => {
  const ui = await source("app/customer-service-console.tsx");
  for (const marker of ["待接待", "未读", "我的", "搜索访客", "我的状态", "分配客服", "访客画像", "客服处理", "商机信息", "客服在线状态"]) assert.match(ui, new RegExp(marker));
  assert.match(ui, /action:\s*"read"/);
  assert.match(ui, /action:\s*"presence"/);
  assert.match(ui, /action:\s*"assign"/);
  assert.match(ui, /onOpenTrace/);
});

test("conversation API persists member unread state, presence, assignment and waiting queue semantics", async () => {
  const route = await source("app/api/commercial/conversations/route.ts");
  for (const marker of ["customer_conversation_reads", "customer_service_presence", "summaryOnly", "unread_count", "waiting_since", "first_response_at", "action === \"assign\"", "action === \"reopen\""]) assert.ok(route.includes(marker), `missing ${marker}`);
});

test("customer service center has range-aware report definitions and structured trace diagnostics", async () => {
  const ui = await source("app/customer-service-center.tsx");
  assert.ok(ui.includes("([7, 30, 90] as RangeDays[]).map"), "missing 7/30/90 report range selector");
  assert.ok(ui.includes("近 {item} 天"), "report range labels are not rendered from the selector");
  for (const marker of ["平均首次响应", "平均解决时长", "报表口径说明", "客服处理效率", "Grounding evidence", "Vector", "Rerank", "Confidence"]) assert.match(ui, new RegExp(marker));
  assert.doesNotMatch(ui, /JSON\.stringify\(trace\.sources/);
});

test("dashboard API reports service efficiency, agent performance and trace stages", async () => {
  const route = await source("app/api/commercial/service-dashboard/route.ts");
  for (const marker of ["avg_first_response_seconds", "avg_resolution_seconds", "sla_breached", "agentPerformance", "bestVector", "bestRerank", "rangeDays", "ticketResolutionRate"]) assert.ok(route.includes(marker), `missing ${marker}`);
});

test("phase3 migration creates unique member read and presence state", async () => {
  const migration = await source("drizzle/0018_customer_service_inbox.sql");
  assert.match(migration, /CREATE TABLE customer_conversation_reads/);
  assert.match(migration, /CREATE UNIQUE INDEX customer_conversation_reads_scope_unique/);
  assert.match(migration, /CREATE TABLE customer_service_presence/);
  assert.match(migration, /CREATE UNIQUE INDEX customer_service_presence_scope_unique/);
});
