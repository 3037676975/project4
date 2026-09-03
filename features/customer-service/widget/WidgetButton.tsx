"use client";

import type { WidgetSettings } from "./WidgetSettings";

export function WidgetButton({
  onClick,
  settings,
}: {
  onClick: () => void;
  settings?: WidgetSettings;
}) {
  if (settings?.enabled === false) return null;

  return (
    <button
      onClick={onClick}
      aria-label="打开 AI 客服"
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        border: 0,
        cursor: "pointer",
        background: settings?.themeColor || "linear-gradient(135deg,#4f46e5,#7c3aed)",
        color: "white",
        fontSize: 26,
        boxShadow: "0 12px 30px rgba(79,70,229,.35)",
        position: "fixed",
        right: settings?.position === "left" ? "auto" : 24,
        left: settings?.position === "left" ? 24 : "auto",
        bottom: 24,
      }}
    >
      {settings?.avatar || "✦"}
    </button>
  );
}
