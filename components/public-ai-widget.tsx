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

function localFallback(question: string) {
  const text = question.toLowerCase();
  if (/价格|套餐|收费|多少钱|费用/.test(text)) return "KnowFlow 支持按企业规模、会话量和是否需要人工客服来配置套餐。你可以告诉我团队人数和预计月会话量，我可以继续帮你梳理。";
  if (/演示|demo|试用|体验/.test(text)) return "可以。当前窗口就是官网客服体验入口，也可以进入控制台继续配置知识库、AI 助手和人工接待。";
  if (/人工|客服|售后|联系/.test(text)) return "支持 AI 先接待、人工无缝接管。访客无需切换窗口，转人工后会进入客服工作台继续处理。";
  if (/rag|知识库|文档|pdf|word|excel/.test(text)) return "KnowFlow 可以把企业文档接入知识库，通过 RAG 检索后生成有依据的回答，并保留来源、Trace 和质量评估。";
  if (/部署|docker|私有化|服务器|宝塔/.test(text)) return "支持 Docker 私有化部署，也支持 GitHub + 宝塔自动部署。模型服务、向量库和业务应用可以按服务器资源拆分。";
  return "收到你的问题。AI 服务这次响应较慢，我先用官网基础知识为你回复。你也可以继续问我：套餐、RAG、人工客服、私有化部署或预约演示。";
}

function createVisitorId() {
  return `visitor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}_${Math.random().toString(36).slice(2, 14)}`;
}

function getVisitorId() {
  if (typeof window === "undefined") return "visitor_web_000000000000";
  const key = "knowflow_homepage_visitor";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9_-]{12,120}$/.test(existing)) return existing;
    const id = createVisitorId();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return createVisitorId();
  }
}

const agentAvatarStyle = {
  width: 46,
  height: 46,
  borderRadius: 15,
  objectFit: "cover" as const,
  objectPosition: "center 20%",
  border: "2px solid rgba(255,255,255,.78)",
  boxShadow: "0 10px 28px rgba(0,0,0,.18)",
  background: "#f5f7ff",
};

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
      text: "你好 👋 我是 KnowFlow AI 客服。直接问我产品、套餐、RAG、部署或人工客服都可以。",
      meta: "AI 助手在线 · 官网客服 v5",
    },
  ]);
  const messageBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(true);
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

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("/api/public/homepage-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ message: text, visitorId, conversationId, conversationToken, mode }),
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
      if (!response.ok && !data.answer) throw new Error(data.error || `服务请求失败（${response.status}）`);

      const sourceText = Array.isArray(data.sources) && data.sources.length ? ` · ${data.sources.length} 个知识来源` : "";
      setMessages((items) => [...items, {
        id: makeId("ai"),
        role: "ai",
        text: data.answer || localFallback(text),
        meta: data.fallback ? "官网基础知识回复" : `AI 知识库回复${sourceText}`,
      }]);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      setMessages((items) => [...items, {
        id: makeId("fallback"),
        role: "ai",
        text: timedOut ? localFallback(text) : `${error instanceof Error ? error.message : "AI 服务暂时不可用。"}\n\n${localFallback(text)}`,
        meta: timedOut ? "AI 响应超时 · 已自动切换官网基础回复" : "服务异常 · 已自动兜底",
        error: !timedOut,
      }]);
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }

  function switchMode(next: "ai" | "human") {
    setMode(next);
    if (next === "human") {
      setMessages((items) => [...items, {
        id: makeId("system"),
        role: "ai",
        text: "已切换到人工接待模式。发送下一条消息后，会尝试把会话交给客服工作台。",
        meta: "人工接待",
      }]);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="重新打开 KnowFlow 客服" style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1000, display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(99,102,241,.16)", background: "rgba(255,255,255,.97)", boxShadow: "0 18px 50px rgba(15,23,42,.16)", borderRadius: 999, padding: "8px 14px 8px 8px", cursor: "pointer", color: "#0f172a", backdropFilter: "blur(18px)" }}>
        <img src="/brand/support-agent-v3.jpg" alt="真人客服" style={{ ...agentAvatarStyle, width: 38, height: 38, borderRadius: 12, border: "1px solid #fff" }} />
        <span style={{ textAlign: "left", lineHeight: 1.1 }}><b style={{ display: "block", fontSize: 13 }}>AI 客服</b><small style={{ color: "#16a34a", fontSize: 11 }}>● 在线</small></span>
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1000, width: "min(380px, calc(100vw - 28px))", height: "min(600px, calc(100vh - 36px))", maxHeight: "calc(100vh - 36px)", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 26, border: "1px solid rgba(148,163,184,.25)", background: "rgba(255,255,255,.98)", boxShadow: "0 28px 90px rgba(15,23,42,.22), 0 8px 24px rgba(79,70,229,.08)", fontFamily: "var(--font-geist-sans), system-ui, sans-serif", backdropFilter: "blur(22px)" }}>
      <div style={{ position: "relative", padding: "16px 16px 13px", color: "white", background: "linear-gradient(135deg,#0f172a 0%,#312e81 55%,#6d28d9 100%)" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 85% -20%, rgba(255,255,255,.25), transparent 42%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/brand/support-agent-v3.jpg" alt="KnowFlow 真人客服" style={agentAvatarStyle} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 760, fontSize: 15 }}>KnowFlow 智能客服</div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.78)" }}><span style={{ width: 7, height: 7, borderRadius: 999, background: mode === "ai" ? "#4ade80" : "#fbbf24" }} />{mode === "ai" ? "AI 在线 · 知识库优先" : "人工接待模式"}</div></div>
          <button onClick={() => setOpen(false)} aria-label="关闭客服" style={{ width: 34, height: 34, borderRadius: 12, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "white", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 13, padding: 4, borderRadius: 14, background: "rgba(255,255,255,.09)" }}>
          <button onClick={() => switchMode("ai")} style={{ border: 0, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontWeight: 650, fontSize: 12, color: mode === "ai" ? "#312e81" : "rgba(255,255,255,.75)", background: mode === "ai" ? "white" : "transparent" }}>✦ AI 接待</button>
          <button onClick={() => switchMode("human")} style={{ border: 0, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontWeight: 650, fontSize: 12, color: mode === "human" ? "#312e81" : "rgba(255,255,255,.75)", background: mode === "human" ? "white" : "transparent" }}>◎ 转人工</button>
        </div>
      </div>

      <div ref={messageBoxRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 14px 12px", background: "linear-gradient(180deg,#f8fafc 0%,#ffffff 45%)" }}>
        {messages.map((message) => <div key={message.id} style={{ display: "flex", justifyContent: message.role === "user" ? "flex-end" : "flex-start", marginBottom: 14 }}><div style={{ maxWidth: "86%" }}>{message.role === "ai" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: "#64748b", fontSize: 11 }}><img src="/brand/support-agent-v3.jpg" alt="真人客服" style={{ width: 22, height: 22, borderRadius: 7, objectFit: "cover", objectPosition: "center 20%" }} /> KnowFlow AI</div>}<div style={{ padding: "11px 13px", borderRadius: message.role === "user" ? "17px 17px 5px 17px" : "17px 17px 17px 5px", background: message.role === "user" ? "linear-gradient(135deg,#4f46e5,#6d28d9)" : message.error ? "#fff7ed" : "#fff", color: message.role === "user" ? "white" : "#1e293b", border: message.role === "user" ? "none" : `1px solid ${message.error ? "#fed7aa" : "#e2e8f0"}`, boxShadow: message.role === "user" ? "0 8px 18px rgba(79,70,229,.2)" : "0 6px 18px rgba(15,23,42,.05)", fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{message.text}</div>{message.meta && <div style={{ marginTop: 5, color: "#94a3b8", fontSize: 10.5, textAlign: message.role === "user" ? "right" : "left" }}>{message.meta}</div>}</div></div>)}
        {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12 }}><img src="/brand/support-agent-v3.jpg" alt="真人客服" style={{ width: 28, height: 28, borderRadius: 9, objectFit: "cover", objectPosition: "center 20%" }} /><span>正在查询知识库… 最多等待 15 秒</span></div>}
      </div>

      <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #eef2f7", background: "#fff" }}>
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 9 }}>{quickQuestions.map((item) => <button key={item} onClick={() => void sendMessage(item)} disabled={loading} style={{ flex: "0 0 auto", borderRadius: 999, padding: "7px 10px", border: "1px solid #e0e7ff", background: "#f8faff", color: "#4f46e5", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{item}</button>)}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: 7, borderRadius: 17, border: "1px solid #dbe3ee", background: "#fff", boxShadow: "0 6px 18px rgba(15,23,42,.04)" }}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={1} placeholder="输入你的问题…" style={{ flex: 1, resize: "none", border: 0, outline: 0, padding: "8px 7px", font: "inherit", fontSize: 13, lineHeight: 1.45, color: "#0f172a", background: "transparent" }} />
          <button onClick={() => void sendMessage()} disabled={loading || !input.trim()} aria-label="发送消息" style={{ width: 38, height: 38, borderRadius: 13, border: 0, background: loading || !input.trim() ? "#cbd5e1" : "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "white", fontSize: 18, cursor: loading || !input.trim() ? "default" : "pointer" }}>↑</button>
        </div>
        <div style={{ marginTop: 7, textAlign: "center", color: "#94a3b8", fontSize: 10.5 }}>Enter 发送 · Shift + Enter 换行 · v5</div>
      </div>
    </div>
  );
}
