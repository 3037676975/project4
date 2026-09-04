import assert from "node:assert/strict";
import test from "node:test";

test("renders current product metadata and workspace login surface", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/login", {
      headers: {
        accept: "text/html",
        "oai-authenticated-user-email": "test@example.com",
        "oai-authenticated-user-full-name": "KnowFlow%20Test",
        "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>KnowFlow · 企业级 AI 客服与知识库平台<\/title>/i);
  assert.match(html, /<meta[^>]+name=["']description["'][^>]+企业知识成为可靠的服务能力/i);
  assert.match(html, /企业账号登录/);
  assert.match(html, /企业专属后台/);
});
