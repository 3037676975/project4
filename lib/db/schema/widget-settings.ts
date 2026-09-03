import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * SaaS Widget configuration storage.
 *
 * This table is designed for multi-tenant AI customer service widgets.
 */
export const widgetSettings = pgTable("widget_settings", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  title: text("title").notNull().default("AI Assistant"),
  welcomeMessage: text("welcome_message").notNull().default("您好，我是 AI 客服助手"),
  avatar: text("avatar"),
  themeColor: text("theme_color").default("#2563eb"),
  position: text("position").default("right"),
  mode: text("mode").default("ai"),
  quickQuestions: jsonb("quick_questions").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
