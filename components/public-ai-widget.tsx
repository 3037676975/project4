"use client";

import { useState } from "react";

const quickQuestions = ["了解套餐", "预约演示", "技术支持", "联系客服"];

type Message = { role: "ai" | "user"; text: string };

const visitorId = `visitor_${Math.random().toString(36).slice(2)}_${Date.now()}`;

export default function PublicAiWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "你好 👋 我是 KnowFlow AI 客服，可以帮助你了解产品、套餐和技术方案。" },
  ]);

  async function sendMessage(text = input) {
    if (!text.trim()) return;
    setMessages((items) => [...items, { role: "user", text }]);
    setInput("");

    setLoading(true);
    try {
      const response = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: "default",
          question: text,
          visitorId,
          mode,
        }),
      });

      const data = await response.json();
      setMessages((items) => [
        ...items,
        { role: "ai", text: data.answer || data.message || "暂无回复，请稍后重试。" },
      ]);
    } catch {
      setMessages((items) => [
        ...items,
        { role: "ai", text: "客服服务连接失败，请稍后重试。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 100 }}>
      {open && (
        <div style={{ width: 380, marginBottom: 16, borderRadius: 24, background: "white", boxShadow: "0 24px 80px rgba(15,23,42,.2)", overflow: "hidden" }}>
          <header style={{ padding: 18, background: "linear-gradient(135deg,#312e81,#6366f1)", color: "white" }}>
            <b>KnowFlow AI 客服</b>
            <div>{mode === "ai" ? "AI助手在线" : "人工客服模式"}</div>
          </header>
          <div style={{ padding: 16, height: 300, overflowY: "auto" }}>
            {messages.map((message, index) => (
              <div key={index} style={{ marginBottom: 12, textAlign: message.role === "user" ? "right" : "left" }}>
                <span style={{ padding: 12, borderRadius: 16, background: message.role === "user" ? "#4f46e5" : "#f1f5f9", color: message.role === "user" ? "white" : "#111" }}>{message.text}</span>
              </div>
            ))}
            {loading && <div>AI 正在思考...</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {quickQuestions.map((item) => <button key={item} onClick={() => sendMessage(item)}>{item}</button>)}
            </div>
          </div>
          <div style={{ display: "flex", padding: 12, gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入你的问题..." />
            <button onClick={() => sendMessage()}>发送</button>
          </div>
          <div style={{ padding: 12 }}>
            <button onClick={() => setMode("ai")}>AI客服</button>
            <button onClick={() => setMode("human")}>人工客服</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} style={{ width:64,height:64,borderRadius:"50%",background:"#4f46e5",color:"white",border:0,fontSize:24 }}>✦</button>
    </div>
  );
}
