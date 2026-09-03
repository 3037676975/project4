"use client";

import { useState } from "react";

const quickQuestions = ["了解套餐", "预约演示", "技术支持", "联系客服"];

export default function PublicAiWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "human">("ai");

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 100, fontFamily: "var(--font-geist-sans)" }}>
      {open && (
        <div style={{ width: 360, marginBottom: 16, borderRadius: 24, background: "#fff", boxShadow: "0 24px 80px rgba(15,23,42,.2)", overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <div style={{ padding: 18, background: "linear-gradient(135deg,#312e81,#6366f1)", color: "white" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>K</div>
              <div>
                <div style={{ fontWeight: 700 }}>KnowFlow AI 客服</div>
                <div style={{ fontSize: 13, opacity: .85 }}>{mode === "ai" ? "AI助手在线 · 秒级响应" : "人工客服接待中"}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: 16, minHeight: 260, color: "#334155", fontSize: 14 }}>
            <div style={{ background: "#f8fafc", padding: 14, borderRadius: 16, marginBottom: 12 }}>
              你好 👋 我可以帮助你了解产品、套餐和技术方案。
            </div>
            <div style={{ background: "#4f46e5", color: "white", padding: 14, borderRadius: 16, marginLeft: 40 }}>
              我想了解企业版功能
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
              {quickQuestions.map((item) => (
                <button key={item} style={{ border: "1px solid #ddd6fe", background: "#faf5ff", color: "#4f46e5", borderRadius: 999, padding: "7px 12px", cursor: "pointer" }}>{item}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: 12, borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
            <button onClick={() => setMode("ai")} style={{ flex: 1, height: 38, borderRadius: 12, border: "1px solid #ddd6fe", background: mode === "ai" ? "#eef2ff" : "white" }}>AI客服</button>
            <button onClick={() => setMode("human")} style={{ flex: 1, height: 38, borderRadius: 12, border: "1px solid #ddd6fe", background: mode === "human" ? "#eef2ff" : "white" }}>人工客服</button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(!open)} aria-label="打开客服" style={{ width: 64, height: 64, borderRadius: "50%", border: 0, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "white", fontSize: 24, cursor: "pointer", boxShadow: "0 16px 40px rgba(79,70,229,.4)" }}>
        {open ? "×" : "✦"}
      </button>
    </div>
  );
}
