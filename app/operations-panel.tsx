"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type CostData = {
  summary: { revenueCents: number; costCents: number; grossProfitCents: number; grossMargin: number | null; requests: number };
  byModel: Array<{ model: string; requests: number; tokens: number; costCents: number }>;
};

type NotificationData = {
  emailAllowedByPlatform: boolean;
  configs: Array<{ channel: string; endpointHint: string | null; enabled: boolean }>;
  outbox: Array<{ id: string; channel: string; eventType: string; status: string; attempts: number; lastError: string | null }>;
};

function headers(init?: HeadersInit) {
  const value = new Headers(init);
  const tenantId = localStorage.getItem("knowflow_tenant_id");
  if (tenantId) value.set("x-tenant-id", tenantId);
  return value;
}

async function call<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: headers(init?.headers), cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function money(cents: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(Number(cents || 0) / 100);
}

export default function OperationsPanel({ canAdmin, onNotice }: { assistantId: string; canAdmin: boolean; onNotice: (notice: { kind: "ok" | "error"; text: string }) => void }) {
  const [costs, setCosts] = useState<CostData | null>(null);
  const [notifications, setNotifications] = useState<NotificationData | null>(null);
  const [email, setEmail] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [costData, notificationData] = await Promise.all([
      call<CostData>("/api/costs"),
      call<NotificationData>("/api/notifications"),
    ]);
    setCosts(costData);
    setNotifications(notificationData);
    const saved = notificationData.configs.find((item) => item.channel === "email");
    setEmailEnabled(Boolean(saved?.enabled));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => onNotice({ kind: "error", text: error instanceof Error ? error.message : "成本与通知配置加载失败" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, onNotice]);

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    if (!notifications?.emailAllowedByPlatform) return onNotice({ kind: "error", text: "超级管理员尚未允许企业启用客服邮件通知。" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return onNotice({ kind: "error", text: "请输入有效的客服邮箱。" });
    setBusy("email");
    try {
      await call("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "email",
          endpoint: email.trim(),
          enabled: emailEnabled,
          events: ["ticket.created", "ticket.updated", "ticket.sla_breached", "lead.created"],
        }),
      });
      setEmail("");
      await load();
      onNotice({ kind: "ok", text: emailEnabled ? "客服邮件通知已保存。新工单、转人工与 SLA 异常会发送到绑定邮箱。" : "客服邮件通知已关闭。" });
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy("");
    }
  }

  async function retryEmailQueue() {
    setBusy("flush");
    try {
      const result = await call<{ sent: number; failed: number }>("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flush" }),
      });
      await load();
      onNotice({ kind: result.failed ? "error" : "ok", text: `邮件通知发送 ${result.sent} 条，失败 ${result.failed} 条。` });
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "发送失败" });
    } finally {
      setBusy("");
    }
  }

  const savedEmail = notifications?.configs.find((item) => item.channel === "email");
  const emailAllowed = Boolean(notifications?.emailAllowedByPlatform);

  return <div className="operations-page operations-simple">
    <section className="metric-grid">
      <article><span>近 30 天模型 / OCR 花费</span><strong>{money(costs?.summary.costCents || 0)}</strong><small>只展示企业实际产生的 AI 成本</small></article>
      <article><span>计费调用</span><strong>{costs?.summary.requests || 0}</strong><small>模型与 OCR 计费记录</small></article>
      <article><span>平均单次成本</span><strong>{money(costs?.summary.requests ? Math.round((costs?.summary.costCents || 0) / costs.summary.requests) : 0)}</strong><small>按当前计费记录计算</small></article>
      <article><span>成本状态</span><strong className="good">实时统计</strong><small>企业端不再展示平台毛利与收入</small></article>
    </section>

    <div className="operations-grid">
      <section className="card cost-summary-card">
        <div className="card-head"><div><p className="section-kicker">AI COSTS</p><h2>模型与 OCR 花费</h2></div><span className="count-badge">{costs?.byModel.length || 0} 项</span></div>
        <p>这里仅用于查看当前企业实际产生的 AI 成本。模型单价与平台毛利由超级管理员统一管理，企业端不能修改。</p>
        <div className="cost-model-list">
          {!costs?.byModel.length && <div className="source-empty">还没有计费调用记录。</div>}
          {costs?.byModel.map((item) => <article key={item.model}><b>{item.model}</b><span>{item.requests} 次 · {item.tokens.toLocaleString("zh-CN")} Tokens</span><strong>{money(item.costCents)}</strong></article>)}
        </div>
      </section>

      <section className="card support-email-card">
        <div className="card-head"><div><p className="section-kicker">SUPPORT EMAIL</p><h2>客服邮件通知</h2></div><span className={emailAllowed ? "live-badge" : "warn-badge"}>{emailAllowed ? "平台已允许" : "平台未开放"}</span></div>
        <p className={`email-permission-note ${emailAllowed ? "" : "blocked"}`}>{emailAllowed ? "超级管理员已允许企业绑定客服邮箱。新工单、人工接管、销售线索与 SLA 异常可以通过平台邮件服务发送。" : "该能力由超级管理员全局控制。平台开启后，企业才能绑定客服邮箱并启用通知。"}</p>
        <form className="settings-form" onSubmit={saveEmail}>
          <label>客服通知邮箱</label>
          <input type="email" value={email} disabled={!emailAllowed || !canAdmin} onChange={(event) => setEmail(event.target.value)} placeholder={savedEmail?.endpointHint || "例如 support@company.com"}/>
          {savedEmail?.endpointHint && <small className="bound-email-hint">当前已绑定：{savedEmail.endpointHint}；留空保存会保留原邮箱。</small>}
          <label className="reuse-secret"><input type="checkbox" checked={emailEnabled} disabled={!emailAllowed || !canAdmin} onChange={(event) => setEmailEnabled(event.target.checked)}/><span><b>启用客服邮件通知</b><small>通知发送使用超级管理员配置的 SMTP，不需要企业填写密钥。</small></span></label>
          <div className="form-actions"><button className="primary-button fit" disabled={!canAdmin || !emailAllowed || busy === "email"}>{busy === "email" ? "保存中…" : "保存邮箱通知"}</button><button type="button" className="secondary-button" disabled={!emailAllowed || busy === "flush"} onClick={() => void retryEmailQueue()}>{busy === "flush" ? "发送中…" : "重试通知队列"}</button></div>
        </form>
        <div className="compact-ledger">{notifications?.outbox.filter((item) => item.channel === "email").slice(0, 5).map((item) => <span key={item.id}><b>{item.eventType}</b>{item.status}{item.lastError ? ` · ${item.lastError}` : ""}</span>)}</div>
      </section>
    </div>
  </div>;
}
