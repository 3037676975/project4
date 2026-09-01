import { getRuntime } from "./runtime";

export const LOCAL_SESSION_COOKIE = "knowflow_local_session";

type HeaderReader = { get(name: string): string | null };

function constantTimeTextEqual(left: string, right: string) {
  const size = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < size; index += 1) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}

function cookieValue(headers: HeaderReader, name: string) {
  const cookie = headers.get("cookie") || "";
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(pair.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

export function isLocalRuntime() {
  return getRuntime().APP_ENV === "local";
}

export function localAuthConfigured() {
  const runtime = getRuntime();
  return runtime.APP_ENV === "local" && Boolean(runtime.LOCAL_AUTH_EMAIL && runtime.LOCAL_ADMIN_PASSWORD && runtime.LOCAL_AUTH_SESSION_SECRET);
}

export function hasValidLocalSession(headers: HeaderReader) {
  const runtime = getRuntime();
  if (runtime.APP_ENV !== "local" || !runtime.LOCAL_AUTH_SESSION_SECRET) return false;
  return constantTimeTextEqual(cookieValue(headers, LOCAL_SESSION_COOKIE), runtime.LOCAL_AUTH_SESSION_SECRET);
}

export function verifyLocalCredentials(email: string, password: string) {
  const runtime = getRuntime();
  if (!localAuthConfigured()) return false;
  return constantTimeTextEqual(email.trim().toLowerCase(), String(runtime.LOCAL_AUTH_EMAIL).trim().toLowerCase())
    && constantTimeTextEqual(password, String(runtime.LOCAL_ADMIN_PASSWORD));
}

export function localSessionCookie() {
  const runtime = getRuntime();
  if (!runtime.LOCAL_AUTH_SESSION_SECRET) throw new Error("LOCAL_AUTH_SESSION_SECRET is not configured");
  return `${LOCAL_SESSION_COOKIE}=${encodeURIComponent(runtime.LOCAL_AUTH_SESSION_SECRET)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`;
}

export function expiredLocalSessionCookie() {
  return `${LOCAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
