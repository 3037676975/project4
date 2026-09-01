"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

export type Config = { publicId: string; brandName: string; welcomeMessage: string; themeColor: string; leadCaptureEnabled: boolean; handoffEnabled: boolean; handoffLabel: string; suggestedQuestions: string[]; privacyNotice: string; privacyPolicyUrl: string; privacyVersion: string; retentionDays: number };
type Message = { id: string; serverId?: string; role: "assistant" | "user"; content: string; sources?: string[]; feedback?: "positive" | "negative" };

function newId(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`; }

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "提交失败，请稍后重试。");
  return data;
}

export default function WidgetClient({ config, embedToken }: { config: Config; embedToken: string }) {
  const [visitorId, setVisitorId] = useState(""); const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", content: config.welcomeMessage }]);
  const [question, setQuestion] = useState(""); const [busy, setBusy] = useState(false); const [panel, setPanel] = useState<"lead" | "ticket" | "privacy" | null>(null);
  const [form, setForm] = useState({ name: "", company: "", contact: "", need: "", consent: false }); const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const visitorKey = `knowflow_visitor_${config.publicId}`; const conversationKey = `knowflow_conversation_${config.publicId}`;
    let visitor = localStorage.getItem(visitorKey); if (!visitor) { visitor = newId("visitor"); localStorage.setItem(visitorKey, visitor); }
    setVisitorId(visitor); setConversationId(localStorage.getItem(conversationKey) || "");
  }, [config.publicId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, panel, busy]);

  async function ask(event?: FormEvent, suggested?: string) {
    event?.preventDefault(); const text = (suggested || question).trim(); if (!text || busy || !visitorId) return;
    setQuestion(""); setBusy(true); setNotice(""); setMessages((current) => [...current, { id: newId("local"), role: "user", content: text }]);
    try {
      const data = await post<{ conversationId: string; messageId: string; answer: string; resolved: boolean; sources: Array<{ document: string }> }>("/api/public/chat", { publicId: config.publicId, question: text, conversationId: conversationId || undefined, visitorId, embedToken });
      setConversationId(data.conversationId); localStorage.setItem(`knowflow_conversation_${config.publicId}`, data.conversationId);
      setMessages((current) => [...current, { id: newId("answer"), serverId: data.messageId, role: "assistant", content: data.answer, sources: [...new Set(data.sources.map((item) => item.document))] }]);
      if (!data.resolved && config.handoffEnabled) setNotice("知识库没有找到明确依据，您可以提交人工工单继续处理。");
    } catch (error) { setMessages((current) => [...current, { id: newId("error"), role: "assistant", content: error instanceof Error ? error.message : "服务暂时不可用。" }]); }
    finally { setBusy(false); }
  }

  async function submitLead(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const data = await post<{ message: string }>("/api/public/lead", { publicId: config.publicId, conversationId: conversationId || undefined, visitorId, embedToken, ...form });
      setNotice(data.message); setPanel(null); setForm({ name: "", company: "", contact: "", need: "", consent: false });
    } catch (error) { setNotice(error instanceof Error ? error.message : "提交失败。"); } finally { setBusy(false); }
  }

  async function submitTicket(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const data = await post<{ message: string }>("/api/public/ticket", { publicId: config.publicId, conversationId: conversationId || undefined, visitorId, embedToken, consent: form.consent, contact: form.contact, description: form.need });
      setNotice(data.message); setPanel(null); setForm({ name: "", company: "", contact: "", need: "", consent: false });
    } catch (error) { setNotice(error instanceof Error ? error.message : "提交失败。"); } finally { setBusy(false); }
  }

  async function submitPrivacy(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try { const data = await post<{ message: string }>("/api/public/privacy", { publicId: config.publicId, visitorId, embedToken, contact: form.contact, requestType: form.need || "export" }); setNotice(data.message); setPanel(null); setForm({ name: "", company: "", contact: "", need: "", consent: false }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "提交失败。"); } finally { setBusy(false); }
  }

  async function feedback(message: Message, value: "positive" | "negative") {
    if (!message.serverId || !conversationId) return;
    try { await post("/api/public/feedback", { publicId: config.publicId, conversationId, messageId: message.serverId, visitorId, embedToken, feedback: value });
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedback: value } : item)); setNotice(value === "positive" ? "感谢确认，这会计入真实解决率。" : "已记录未解决问题，建议转人工继续处理。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "反馈提交失败。"); }
  }

  const consentLine = <label className="widget-consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })}/><span>{config.privacyNotice}{config.privacyPolicyUrl ? <> <a href={config.privacyPolicyUrl} target="_blank" rel="noreferrer">查看隐私政策</a></> : null}（保存不超过 {config.retentionDays} 天）</span></label>;
  return <main className="widget-page" style={{ "--widget-color": config.themeColor } as CSSProperties}>
    <section className="widget-card">
      <header className="widget-header"><div className="widget-logo">K</div><div><h1>{config.brandName}</h1><p><i /> AI 知识库在线</p></div><span>企业专属</span></header>
      <div className="widget-messages">
        {messages.map((message) => <article className={`widget-message ${message.role}`} key={message.id}><div>{message.content}</div>{message.sources?.length ? <small>依据：{message.sources.join("、")}</small> : null}{message.serverId && <span className="widget-feedback"><button className={message.feedback === "positive" ? "active" : ""} onClick={() => void feedback(message, "positive")}>有帮助</button><button className={message.feedback === "negative" ? "active" : ""} onClick={() => void feedback(message, "negative")}>没解决</button></span>}</article>)}
        {busy && !panel && <article className="widget-message assistant"><div className="widget-typing"><i/><i/><i/> 正在检索企业资料</div></article>}
        {messages.length === 1 && config.suggestedQuestions.length > 0 && <div className="widget-suggestions">{config.suggestedQuestions.map((item) => <button key={item} onClick={() => void ask(undefined, item)}>{item}</button>)}</div>}
        {notice && <div className="widget-notice">{notice}</div>}
        {panel === "lead" && <form className="widget-form" onSubmit={submitLead}><b>留下需求，获取产品方案</b><div><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="您的称呼" maxLength={60}/><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="公司名称" maxLength={100}/></div><input required value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="手机号 / 微信 / 邮箱（必填）" maxLength={120}/><textarea value={form.need} onChange={(event) => setForm({ ...form, need: event.target.value })} placeholder="采购数量、产品型号或其他需求" maxLength={800}/>{consentLine}<footer><button type="button" onClick={() => setPanel(null)}>取消</button><button disabled={busy || !form.consent}>提交需求</button></footer></form>}
        {panel === "ticket" && <form className="widget-form" onSubmit={submitTicket}><b>转人工服务</b><input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="联系方式（建议填写）" maxLength={120}/><textarea required value={form.need} onChange={(event) => setForm({ ...form, need: event.target.value })} placeholder="请描述 AI 未解决的问题" maxLength={1200}/>{consentLine}<footer><button type="button" onClick={() => setPanel(null)}>取消</button><button disabled={busy || !form.consent}>创建工单</button></footer></form>}
        {panel === "privacy" && <form className="widget-form" onSubmit={submitPrivacy}><b>个人数据权利请求</b><input required value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="用于核验身份的手机号或邮箱" maxLength={160}/><select value={form.need || "export"} onChange={(event) => setForm({ ...form, need: event.target.value })}><option value="export">导出我的咨询数据</option><option value="delete">删除我的咨询数据</option></select><small>企业管理员核验身份后处理，防止他人冒用您的联系方式删除数据。</small><footer><button type="button" onClick={() => setPanel(null)}>取消</button><button disabled={busy}>提交请求</button></footer></form>}
        <div ref={bottomRef}/>
      </div>
      <div className="widget-actions">{config.leadCaptureEnabled && <button onClick={() => { setPanel("lead"); setNotice(""); }}>获取方案</button>}{config.handoffEnabled && <button onClick={() => { setPanel("ticket"); setNotice(""); }}>{config.handoffLabel}</button>}</div>
      <form className="widget-input" onSubmit={(event) => void ask(event)}><textarea rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="请输入您的问题…" maxLength={1200}/><button disabled={busy || !question.trim()} aria-label="发送">↑</button></form>
      <footer className="widget-powered">回答来自企业知识库 · 重要信息请以人工确认为准 · <button onClick={() => { setPanel("privacy"); setNotice(""); }}>数据导出/删除</button></footer>
    </section>
  </main>;
}
