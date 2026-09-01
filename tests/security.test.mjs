import assert from "node:assert/strict";
import test from "node:test";
import { clientIp, constantTimeEqual, hmacSha256, randomToken, sha256 } from "../lib/security.ts";

test("security hashes and signatures are deterministic", async () => {
  assert.equal(await sha256("knowflow"), "be611be935fa8ad02b1efb3a88c66b1bc60b9ba24c5b2d15f97a53c49fc86acc");
  assert.equal(await hmacSha256("k", "v"), "c5d4be1992d50d3b41f9a21292fc67a28a1486fc64a0517d37f9af847e0732de");
});

test("constant-time comparison rejects changed or truncated signatures", () => {
  assert.equal(constantTimeEqual("abcdef", "abcdef"), true);
  assert.equal(constantTimeEqual("abcdef", "abcdeg"), false);
  assert.equal(constantTimeEqual("abcdef", "abcde"), false);
});

test("random public tokens are URL-safe and unique", () => {
  const first = randomToken(32); const second = randomToken(32);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test("client address uses trusted proxy header order", () => {
  assert.equal(clientIp(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.2", "x-forwarded-for": "198.51.100.5" } })), "203.0.113.2");
  assert.equal(clientIp(new Request("https://example.test", { headers: { "x-forwarded-for": "198.51.100.5, 10.0.0.1" } })), "198.51.100.5");
});
