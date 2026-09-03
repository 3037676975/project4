"use client";

import React, { useState } from "react";
import { sendWidgetMessage } from "./WidgetApi";

const presets = ["了解套餐", "预约演示", "技术支持", "联系客服"];

export function WidgetPanel({ open }: { open: boolean }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "ai", text: "你好，我是 KnowFlow AI 客服，可以帮助你了解产品。" },
  ]);
  const [loading, setLoading] = useState(false);

  async function send(text = input) {
    if (!text.trim()) return;

    setMessages((items) => [...items, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const result = await sendWidgetMessage(text);
      setMessages((items) => [
        ...items,
        { role: "ai", text: result || "暂无回复，请稍后再试。" },
      ]);
    } catch {
      setMessages((items) => [
        ...items,
        { role: "ai", text: "客服连接失败，请稍后重试。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <section className="project4-widget-panel" aria-label="AI customer service panel">
      <header className="project4-widget-header">KnowFlow AI 客服</header>
      <div className="project4-widget-body">
        {messages.map((item, index) => (
          <p key={index}>
            <strong>{item.role === "ai" ? "AI" : "你"}：</strong>{item.text}
          </p>
        ))}
        {loading && <p>AI 正在思考...</p>}
      </div>
      <div>
        {presets.map((item) => (
          <button key={item} onClick={() => send(item)}>{item}</button>
        ))}
      </div>
      <footer>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入问题" />
        <button onClick={() => send()}>发送</button>
      </footer>
    </section>
  );
}
