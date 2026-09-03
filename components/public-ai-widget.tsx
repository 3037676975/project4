"use client";

import { useState } from "react";

export default function PublicAiWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 50,
        fontFamily: "var(--font-geist-sans)",
      }}
    >
      {open && (
        <div
          style={{
            width: 340,
            marginBottom: 14,
            borderRadius: 20,
            background: "#fff",
            boxShadow: "0 20px 60px rgba(15,23,42,.18)",
            overflow: "hidden",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              padding: 18,
              background: "linear-gradient(135deg,#0f172a,#2563eb)",
              color: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>KnowFlow AI 客服</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              AI 助手在线 · 可转人工
            </div>
          </div>
          <div style={{ padding: 16, color: "#334155", fontSize: 14 }}>
            <div style={{ background: "#f1f5f9", padding: 12, borderRadius: 14 }}>
              你好，需要了解产品、套餐还是售后？
            </div>
            <div
              style={{
                marginTop: 12,
                background: "#2563eb",
                color: "white",
                padding: 12,
                borderRadius: 14,
              }}
            >
              支持人工客服吗？
            </div>
            <button
              style={{
                marginTop: 14,
                width: "100%",
                height: 40,
                borderRadius: 12,
                border: 0,
                background: "#0f172a",
                color: "white",
                cursor: "pointer",
              }}
            >
              转人工客服
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-label="打开客服"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: 0,
          background: "#2563eb",
          color: "white",
          fontSize: 24,
          boxShadow: "0 12px 30px rgba(37,99,235,.35)",
          cursor: "pointer",
        }}
      >
        {open ? "×" : "✦"}
      </button>
    </div>
  );
}
