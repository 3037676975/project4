import type { WidgetSettings } from "./WidgetSettings";

/**
 * Widget 配置存储抽象层。
 *
 * Phase 2.10 先统一读取入口，避免 Widget 组件直接依赖存储实现。
 * 后续接入数据库时，只需要替换 adapter，不需要修改 Widget UI。
 */

const defaultSettings: WidgetSettings = {
  enabled: true,
  title: "KnowFlow AI 客服",
  welcomeMessage: "你好，我可以帮助你了解产品、价格和技术方案。",
  avatar: "🤖",
  themeColor: "#2563eb",
  position: "right",
  mode: "hybrid",
  quickQuestions: ["产品介绍", "价格咨询", "联系客服"],
};

let runtimeSettings: WidgetSettings = defaultSettings;

export function getWidgetSettings(): WidgetSettings {
  return runtimeSettings;
}

export function updateWidgetSettings(
  settings: Partial<WidgetSettings>,
): WidgetSettings {
  runtimeSettings = {
    ...runtimeSettings,
    ...settings,
  };

  return runtimeSettings;
}
