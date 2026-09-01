import { getRuntime } from "./runtime";

export const BUILTIN_MANUAL_VISIBILITY_KEY = "builtin_manual_visible";
export const BUILTIN_MANUAL_APPLICATION_KEY = "builtin_manual_applied";

export async function isBuiltinManualVisible() {
  const row = await getRuntime().DB.prepare("SELECT value FROM platform_settings WHERE key = ? LIMIT 1")
    .bind(BUILTIN_MANUAL_VISIBILITY_KEY).first<{ value: string }>();
  return row?.value !== "0";
}

export async function isBuiltinManualApplied() {
  const row = await getRuntime().DB.prepare("SELECT value FROM platform_settings WHERE key = ? LIMIT 1")
    .bind(BUILTIN_MANUAL_APPLICATION_KEY).first<{ value: string }>();
  return row?.value !== "0";
}
