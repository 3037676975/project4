import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { hasValidLocalSession, localSessionCookie, verifyLocalCredentials } from "../lib/local-auth.ts";

Object.assign(env, {
  APP_ENV: "local",
  LOCAL_AUTH_EMAIL: "admin@local.test",
  LOCAL_ADMIN_PASSWORD: "correct-horse-battery-staple",
  LOCAL_AUTH_SESSION_SECRET: "session-secret-with-high-entropy-for-test",
});

test("private admin credentials require both matching email and password", () => {
  assert.equal(verifyLocalCredentials("admin@local.test", "correct-horse-battery-staple"), true);
  assert.equal(verifyLocalCredentials("other@local.test", "correct-horse-battery-staple"), false);
  assert.equal(verifyLocalCredentials("admin@local.test", "wrong-password"), false);
});

test("private session accepts only the configured HttpOnly cookie value", () => {
  const cookie = localSessionCookie();
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(hasValidLocalSession(new Headers({ cookie: "knowflow_local_session=session-secret-with-high-entropy-for-test" })), true);
  assert.equal(hasValidLocalSession(new Headers({ cookie: "knowflow_local_session=changed" })), false);
});
