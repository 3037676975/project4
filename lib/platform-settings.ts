import { getRuntime } from "./runtime";

export const BUILTIN_MANUAL_VISIBILITY_KEY = "builtin_manual_visible";
export const BUILTIN_MANUAL_APPLICATION_KEY = "builtin_manual_applied";
export const HOMEPAGE_WIDGET_CONFIG_KEY = "homepage_widget_config";
export const SUPPORT_EMAIL_NOTIFICATIONS_KEY = "support_email_notifications_allowed";

export type HomepageWidgetConfig = {
  enabled: boolean;
  autoOpen: boolean;
  title: string;
  welcomeMessage: string;
  quickQuestions: string[];
};

export const DEFAULT_HOMEPAGE_WIDGET_CONFIG: HomepageWidgetConfig = {
  enabled: true,
  autoOpen: true,
  title: "KnowFlow 智能客服",
  welcomeMessage: "你好 👋 我是 KnowFlow AI 客服。直接问我产品、套餐、RAG、部署或人工客服都可以。",
  quickQuestions: ["了解套餐", "预约演示", "RAG 怎么用", "支持私有化吗"],
};

async function readSetting(key: string) {
  return getRuntime().DB.prepare("SELECT value FROM platform_settings WHERE key = ? LIMIT 1").bind(key).first<{ value: string }>();
}

export async function writePlatformSetting(key: string, value: string, updatedBy: string) {
  const now = new Date().toISOString();
  await getRuntime().DB.prepare(`INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(key, value, updatedBy, now).run();
  return now;
}

export async function isBuiltinManualVisible() {
  const row = await readSetting(BUILTIN_MANUAL_VISIBILITY_KEY);
  return row?.value !== "0";
}

export async function isBuiltinManualApplied() {
  const row = await readSetting(BUILTIN_MANUAL_APPLICATION_KEY);
  return row?.value !== "0";
}

export async function loadHomepageWidgetConfig(): Promise<HomepageWidgetConfig> {
  const row = await readSetting(HOMEPAGE_WIDGET_CONFIG_KEY);
  if (!row?.value) return DEFAULT_HOMEPAGE_WIDGET_CONFIG;
  try {
    const parsed = JSON.parse(row.value) as Partial<HomepageWidgetConfig>;
    const quickQuestions = Array.isArray(parsed.quickQuestions)
      ? parsed.quickQuestions.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 8)
      : DEFAULT_HOMEPAGE_WIDGET_CONFIG.quickQuestions;
    return {
      enabled: parsed.enabled !== false,
      autoOpen: parsed.autoOpen !== false,
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 40) : DEFAULT_HOMEPAGE_WIDGET_CONFIG.title,
      welcomeMessage: typeof parsed.welcomeMessage === "string" && parsed.welcomeMessage.trim() ? parsed.welcomeMessage.trim().slice(0, 500) : DEFAULT_HOMEPAGE_WIDGET_CONFIG.welcomeMessage,
      quickQuestions: quickQuestions.length ? quickQuestions : DEFAULT_HOMEPAGE_WIDGET_CONFIG.quickQuestions,
    };
  } catch {
    return DEFAULT_HOMEPAGE_WIDGET_CONFIG;
  }
}

export async function supportEmailNotificationsAllowed() {
  const row = await readSetting(SUPPORT_EMAIL_NOTIFICATIONS_KEY);
  return row?.value === "1";
}
