"use client";

import { useState } from "react";

const quickQuestions = ["了解套餐", "预约演示", "技术支持", "联系客服"];

type Message = { role: "ai" | "user"; text: string };

export default function PublicAiWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(1);
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "你好 👋 我是 KnowFlow AI 客服，可以帮助你了解产品、套餐和技术方案。" },
  ]);

  async function sendMessage(text = input) {
    if (!text.trim()) return;
    setMessages((items) => [...items, { role: "user", text }]);
    setInput("");

    if (mode === "human") {
      setMessages((items) => [...items, { role: "ai", text: "正在为你连接人工客服，请稍候。" }]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await response.json();
      setMessages((items) => [...items, { role: "ai", text: data.answer || data.message || "我正在查询相关信息。" }]);
    } catch {
      setMessages((items) => [...items, { role: "ai", text: "暂时无法连接服务，请稍后重试或转人工。" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 100, fontFamily: "var(--font-geist-sans)" }}>
      {open && (
        <div style={{ width: 380, marginBottom: 16, borderRadius: 24, background: "#fff", boxShadow: "0 24px 80px rgba(15,23,42,.2)", overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <div style={{ padding: 18, background: "linear-gradient(135deg,#312e81,#6366f1)", color: "white" }}>
            <b>KnowFlow AI 客服</b>
            <div style={{ fontSize: 13, opacity: .85 }}>{mode === "ai" ? "AI助手在线 · 秒级响应" : "人工客服排队中"}</div>
          </div>
          <div style={{ padding: 16, height: 300, overflowY: "auto", fontSize: 14 }}>
            {messages.map((message, index) => (
              <div key={index} style={{ marginBottom: 12, textAlign: message.role === "user" ? "right" : "left" }}>
                <span style={{ display: "inline-block", padding: 12, borderRadius: 16, background: message.role === "user" ? "#4f46e5" : "#f1f5f9", color: message.role === "user" ? "white" : "#334155" }}>{message.text}</span>
              </div>
            ))}
            {loading && <div>AI 正在思考...</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {quickQuestions.map((item) => <button key={item} onClick={() => sendMessage(item)} style={{ borderRadius: 999, padding: "7px 12px", border: "1px solid #ddd6fe", background: "#faf5ff", color: "#4f46e5" }}>{item}</button>)}
            </div>
          </div>
          <div style={{ display: "flex", padding: 12, gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="输入你的问题..." style={{ flex: 1, borderRadius: 12, border: "1px solid #ddd", padding: 10 }} />
            <button onClick={() => sendMessage()} style={{ borderRadius: 12, background: "#4f46e5", color: "white", border: 0, padding: "0 14px" }}>发送</button>
          </div>
          <div style={{ display: "flex", padding: 12, gap: 8 }}>
            <button onClick={() => setMode("ai")}>AI客服</button>
            <button onClick={() => setMode("human")}>人工客服</button>
          </div>
        </div>
      )}
      <button onClick={() => { setOpen(!open); setUnread(0); }} aria-label="打开客服" style={{ position: "relative", width: 64, height: 64, borderRadius: "50%", border: 0, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "white", fontSize: 24 }}>
        {open ? "×" : "✦"}
        {!open && unread > 0 && <span style={{ position: "absolute", top: 0, right: 0, minWidth: 22, height: 22, borderRadius: 999, background: "#ef4444", color: "white", fontSize: 12, display: "grid", placeItems: "center" }}>{unread}</span>}
      </button>
    </div>
  );
}
