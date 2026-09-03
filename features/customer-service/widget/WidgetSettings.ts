export type WidgetMode = "ai" | "hybrid" | "human";

export interface WidgetSettings {
  enabled: boolean;
  title: string;
  welcomeMessage: string;
  avatar?: string;
  themeColor: string;
  position: "left" | "right";
  mode: WidgetMode;
  quickQuestions: string[];
}

export const defaultWidgetSettings: WidgetSettings = {
  enabled: true,
  title: "AI 客服助手",
  welcomeMessage: "您好，我可以帮助您查询产品、订单和常见问题。",
  themeColor: "#2563eb",
  position: "right",
  mode: "ai",
  quickQuestions: ["产品介绍", "价格咨询", "联系客服"],
};
