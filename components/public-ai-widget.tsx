"use client";

import { useEffect, useRef, useState } from "react";

const quickQuestions = ["了解套餐", "预约演示", "RAG 怎么用", "支持私有化吗"];

type Message = {
  id: string;
  role: "ai" | "user";
  text: string;
  meta?: string;
  error?: boolean;
};

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function getVisitorId() {
  if (typeof window === "undefined") return "visitor_web_000000000000";
  const key = "knowflow_homepage_visitor";
  const existing = window.localStorage.getItem(key);
  if (existing && /^[a-zA-Z0-9_-]{12,120}$/.test(existing)) return existing;
  const id = `visitor_${crypto.randomUUID().replaceAll("-", "")}`;
  window.localStorage.setItem(key, id);
  return id;
}

export default function PublicAiWidget() {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [visitorId, setVisitorId] = useState("visitor_web_000000000000");
  const [conversationId, setConversationId] = useState("");
  const [conversationToken, setConversationToken] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "ai",
      text: "你好 👋 我是 KnowFlow AI 客服。你可以直接问我产品、套餐、RAG、部署和人工客服相关问题。",
      meta: "AI 助手在线 · 通常几秒内回复",
    },
  ]);
  const messageBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisitorId(getVisitorId());
  }, []);

  useEffect(() => {
    const box = messageBoxRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  async function sendMessage(value?: string) {
    const text = (value ?? input).trim();
    if (!text || loading) return;

    setMessages((items) => [...items, { id: makeId("user"), role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/public/homepage-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          visitorId,
          conversationId,
          conversationToken,
          mode,
        }),
      });

      const data = await response.json().catch(() => ({})) as {
        answer?: string;
        error?: string;
        conversationId?: string;
        conversationToken?: string;
        fallback?: boolean;
        sources?: Array<{ document?: string }>;
      };

      if (data.conversationId) setConversationId(data.conversationId);
      if (data.conversationToken) setConversationToken(data.conversationToken);

      if (!response.ok && !data.answer) {
        throw new Error(data.error || `服务请求失败（${response.status}）`);
      }

      const sourceText = Array.isArray(data.sources) && data.sources.length
        ? ` · ${data.sources.length} 个知识来源`
        : "";

      setMessages((items) => [
        ...items,
        {
          id: makeId("ai"),
          role: "ai",
          text: data.answer || data.error || "我已经收到你的问题，请稍后再试。",
          meta: data.fallback ? "官网基础知识回复" : `AI 知识库回复${sourceText}`,
        },
      ]);
    } catch (error) {
      setMessages((items) => [
        ...items,
        {
          id: makeId("error"),
          role: "ai",
          text: error instanceof Error ? error.message : "暂时无法连接客服服务，请稍后重试。",
          meta: "连接异常 · 你可以重新发送",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: "ai" | "human") {
    setMode(next);
    if (next === "human") {
      setMessages((items) => [
        ...items,
        {
          id: makeId("system"),
          role: "ai",
          text: "已切换到人工接待模式。发送下一条消息后，我会尝试把会话交给客服工作台。",
          meta: "人工接待",
        },
      ]);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="重新打开 KnowFlow 客服"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "1px solid rgba(99,102,241,.16)",
          background: "rgba(255,255,255,.96)",
          boxShadow: "0 18px 50px rgba(15,23,42,.16)",
          borderRadius: 999,
          padding: "10px 14px 10px 10px",
          cursor: "pointer",
          color: "#0f172a",
          backdropFilter: "blur(18px)",
        }}
      >
        <span style={{ width: 34, height: 34, borderRadius: 12, display: "grid", placeItems: "center", color: "white", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 8px 20px rgba(79,70,229,.28)" }}>✦</span>
        <span style={{ textAlign: "left", lineHeight: 1.1 }}><b style={{ display: "block", fontSize: 13 }}>AI 客服</b><small style={{ color: "#16a34a", fontSize: 11 }}>● 在线</small></span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 1000,
        width: "min(410px, calc(100vw - 28px))",
        height: "min(650px, calc(100vh - 36px))",
        minHeight: 520,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 28,
        border: "1px solid rgba(148,163,184,.25)",
        background: "rgba(255,255,255,.98)",
        boxShadow: "0 28px 90px rgba(15,23,42,.22), 0 8px 24px rgba(79,70,229,.08)",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        backdropFilter: "blur(22px)",
      }}
    >
      <div style={{ position: "relative", padding: "18px 18px 14px", color: "white", background: "linear-gradient(135deg,#111827 0%,#312e81 52%,#5b21b6 100%)" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 85% -20%, rgba(255,255,255,.25), transparent 42%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 15, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#818cf8,#c084fc)", boxShadow: "inset 0 1px rgba(255,255,255,.4), 0 10px 28px rgba(0,0,0,.18)", fontSize: 20 }}>✦</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 750, fontSize: 15, letterSpacing: "-.01em" }}>KnowFlow 智能客服</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.76)" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: mode === "ai" ? "#4ade80" : "#fbbf24", boxShadow: `0 0 0 4px ${mode === "ai" ? "rgba(74,222,128,.12)" : "rgba(251,191,36,.12)"}` }} />
              {mode === "ai" ? "AI 在线 · 知识库优先" : "人工接待模式"}
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="关闭客服" style={{ width: 34, height: 34, borderRadius: 12, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "white", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 15, padding: 4, borderRadius: 14, background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.08)" }}>
          <button onClick={() => switchMode("ai")} style={{ border: 0, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontWeight: 650, fontSize: 12, color: mode === "ai" ? "#312e81" : "rgba(255,255,255,.75)", background: mode === "ai" ? "white" : "transparent" }}>✦ AI 接待</button>
          <button onClick={() => switchMode("human")} style={{ border: 0, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontWeight: 650, fontSize: 12, color: mode === "human" ? "#312e81" : "rgba(255,255,255,.75)", background: mode === "human" ? "white" : "transparent" }}>◎ 转人工</button>
        </div>
      </div>

      <div ref={messageBoxRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 16px 14px", background: "linear-gradient(180deg,#f8fafc 0%,#ffffff 45%)" }}>
        <div style={{ marginBottom: 16, padding: "12px 13px", borderRadius: 16, border: "1px solid #e2e8f0", background: "rgba(255,255,255,.9)", boxShadow: "0 8px 20px rgba(15,23,42,.04)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: ".06em" }}>KNOWFLOW · WEBSITE ASSISTANT</div>
          <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.55, color: "#64748b" }}>直接输入问题即可。已接入公开助手时会优先使用企业知识库；未配置时也会给出官网基础回答。</div>
        </div>

        {messages.map((message) => (
          <div key={message.id} style={{ display: "flex", justifyContent: message.role === "user" ? "flex-end" : "flex-start", marginBottom: 14 }}>
            <div style={{ maxWidth: "86%" }}>
              {message.role === "ai" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, paddingLeft: 2, color: "#64748b", fontSize: 11 }}><span style={{ width: 20, height: 20, borderRadius: 7, display: "grid", placeItems: "center", background: "#eef2ff", color: "#4f46e5", fontWeight: 800 }}>K</span> KnowFlow AI</div>}
              <div style={{ padding: "11px 13px", borderRadius: message.role === "user" ? "17px 17px 5px 17px" : "17px 17px 17px 5px", background: message.role === "user" ? "linear-gradient(135deg,#4f46e5,#6d28d9)" : message.error ? "#fff7ed" : "#fff", color: message.role === "user" ? "white" : "#1e293b", border: message.role === "user" ? "none" : `1px solid ${message.error ? "#fed7aa" : "#e2e8f0"}`, boxShadow: message.role === "user" ? "0 8px 18px rgba(79,70,229,.2)" : "0 6px 18px rgba(15,23,42,.05)", fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{message.text}</div>
              {message.meta && <div style={{ marginTop: 5, paddingLeft: message.role === "user" ? 0 : 2, textAlign: message.role === "user" ? "right" : "left", color: "#94a3b8", fontSize: 10.5 }}>{message.meta}</div>}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: 10, display: "grid", placeItems: "center", background: "#eef2ff", color: "#4f46e5" }}>✦</span>
            <span>正在查询知识库并组织回答…</span>
          </div>
        )}
      </div>

      <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #eef2f7", background: "rgba(255,255,255,.98)" }}>
        <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "1px 1px 9px" }}>
          {quickQuestions.map((item) => (
            <button key={item} onClick={() => sendMessage(item)} disabled={loading} style={{ flex: "0 0 auto", borderRadius: 999, padding: "7px 10px", border: "1px solid #e0e7ff", background: "#f8faff", color: "#4f46e5", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{item}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: 7, borderRadius: 17, border: "1px solid #dbe3ee", background: "#fff", boxShadow: "0 6px 18px rgba(15,23,42,.04)" }}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            rows={1}
            placeholder={mode === "ai" ? "输入你的问题，Enter 发送…" : "输入消息给人工客服…"}
            style={{ flex: 1, minHeight: 38, maxHeight: 88, resize: "none", border: 0, outline: "none", padding: "9px 8px 7px", background: "transparent", color: "#0f172a", font: "inherit", fontSize: 13 }}
          />
          <button onClick={() => void sendMessage()} disabled={loading || !input.trim()} aria-label="发送消息" style={{ width: 39, height: 39, flex: "0 0 auto", borderRadius: 13, border: 0, background: loading || !input.trim() ? "#e2e8f0" : "linear-gradient(135deg,#4f46e5,#7c3aed)", color: loading || !input.trim() ? "#94a3b8" : "white", cursor: loading || !input.trim() ? "default" : "pointer", fontSize: 17, boxShadow: loading || !input.trim() ? "none" : "0 8px 18px rgba(79,70,229,.24)" }}>↑</button>
        </div>
        <div style={{ marginTop: 8, textAlign: "center", color: "#94a3b8", fontSize: 10.5 }}>AI 可能犯错，重要业务信息请结合来源或人工确认</div>
      </div>
    </div>
  );
}
