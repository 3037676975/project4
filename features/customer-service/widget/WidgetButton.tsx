"use client";

export function WidgetButton({ onClick }: { onClick: () => void }) {
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
        background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
        color: "white",
        fontSize: 26,
        boxShadow: "0 12px 30px rgba(79,70,229,.35)",
      }}
    >
      ✦
    </button>
  );
}
