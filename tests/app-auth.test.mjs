import test from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_ITERATIONS, hashPassword, normalizeEmail, passwordPolicyError, portalDestination, verifyPassword } from "../lib/app-auth.ts";

test("password hashes are salted and verify without storing plaintext", async () => {
  const first = await hashPassword("Commercial2026", 10_000);
  const second = await hashPassword("Commercial2026", 10_000);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPassword("Commercial2026", first.hash, first.salt, first.iterations), true);
  assert.equal(await verifyPassword("wrong-password", first.hash, first.salt, first.iterations), false);
  assert.equal(first.hash.includes("Commercial2026"), false);
});

test("account input policy normalizes email and rejects weak passwords", () => {
  assert.equal(normalizeEmail("  Owner@Example.COM "), "owner@example.com");
  assert.equal(passwordPolicyError("short1"), "密码至少需要 10 位。");
  assert.equal(passwordPolicyError("onlylettersxx"), "密码必须同时包含字母和数字。");
  assert.equal(passwordPolicyError("StrongPass2026"), null);
});

test("the hosted password cost stays within the Cloudflare Workers PBKDF2 ceiling", async () => {
  assert.equal(PASSWORD_ITERATIONS, 100_000);
  const password = await hashPassword("Commercial2026");
  assert.equal(password.iterations, 100_000);
  assert.equal(await verifyPassword("Commercial2026", password.hash, password.salt, password.iterations), true);
});

test("role-specific login portals never broaden account access", () => {
  const superAdmin = { platformRole: "super_admin", tenantCount: 1, destination: "/platform" };
  assert.equal(portalDestination(superAdmin, "platform"), "/platform");
  assert.equal(portalDestination(superAdmin, "admin"), "/admin");
  assert.equal(portalDestination(superAdmin, "workspace"), "/workspace");
  const operator = { platformRole: "operator", tenantCount: 0, destination: "/admin" };
  assert.equal(portalDestination(operator, "platform"), null);
  assert.equal(portalDestination(operator, "admin"), "/admin");
  assert.equal(portalDestination(operator, "workspace"), null);
  const tenantMember = { platformRole: null, tenantCount: 2, destination: "/workspace" };
  assert.equal(portalDestination(tenantMember, "platform"), null);
  assert.equal(portalDestination(tenantMember, "admin"), null);
  assert.equal(portalDestination(tenantMember, "workspace"), "/workspace");
});
