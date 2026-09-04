"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type WidgetConfig = { enabled: boolean; autoOpen: boolean; title: string; welcomeMessage: string; quickQuestions: string[] };
type MailConfig = {
  enabled: boolean; host: string; port: number; username: string; passwordConfigured: boolean; passwordHint: string | null;
  fromEmail: string; fromName: string; useSsl: boolean; useStarttls: boolean; relayUrl: string; relayTokenConfigured: boolean;
  relayTokenHint: string | null; relayReady: boolean; directSmtpReady: boolean; deliveryReady: boolean; deliveryMode: "direct_smtp" | "https_relay";
  codeExpiryMinutes: number; resendSeconds: number; maxAttempts: number;
  codeLength: number; orderNotifications: boolean; source: string; updatedAt: string | null;
  homepageWidget: WidgetConfig; supportEmailAllowed: boolean;
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" }); const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export default function MailSettings() {
  const [config, setConfig] = useState<MailConfig | null>(null); const [password, setPassword] = useState(""); const [relayToken, setRelayToken] = useState("");
  const [testEmail, setTestEmail] = useState(""); const [busy, setBusy] = useState(""); const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [quickQuestionsText, setQuickQuestionsText] = useState("");
  const load = useCallback(async () => {
    const data = await api<MailConfig>("/api/platform/mail");
    setConfig(data); setQuickQuestionsText(data.homepageWidget.quickQuestions.join("\n"));
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((error) => setNotice({ kind: "error", text: error instanceof Error ? error.message : "邮件配置加载失败" })), 0); return () => window.clearTimeout(timer); }, [load]);

  function update(patch: Partial<MailConfig>) { setConfig((current) => current ? { ...current, ...patch } : current); }
  function updateWidget(patch: Partial<WidgetConfig>) { setConfig((current) => current ? { ...current, homepageWidget: { ...current.homepageWidget, ...patch } } : current); }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!config) return; setBusy("save"); setNotice(null);
    try {
      const saved = await api<MailConfig>("/api/platform/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", ...config, password, relayToken }) });
      setConfig(saved); setPassword(""); setRelayToken(""); setNotice({ kind: "ok", text: saved.deliveryReady ? `邮件配置已保存，当前使用${saved.deliveryMode === "direct_smtp" ? "直接 SMTP" : "HTTPS 中继"}发送。` : "SMTP 参数已保存，但发送条件尚不完整。" });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); } finally { setBusy(""); }
  }

  async function saveSupportSettings(event: FormEvent) {
    event.preventDefault(); if (!config) return; setBusy("support"); setNotice(null);
    const quickQuestions = quickQuestionsText.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
    try {
      const saved = await api<MailConfig>("/api/platform/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "support_settings", homepageWidget: { ...config.homepageWidget, quickQuestions }, supportEmailAllowed: config.supportEmailAllowed }) });
      setConfig(saved); setQuickQuestionsText(saved.homepageWidget.quickQuestions.join("\n")); setNotice({ kind: "ok", text: "全局官网客服与企业客服邮件权限已保存，前台刷新后生效。" });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "客服全局配置保存失败" }); } finally { setBusy(""); }
  }

  async function test() {
    if (!testEmail.trim()) return setNotice({ kind: "error", text: "请输入测试收件邮箱。" });
    setBusy("test"); setNotice(null);
    try { const data = await api<{ message: string }>("/api/platform/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", to: testEmail }) }); setNotice({ kind: "ok", text: data.message }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "测试发送失败" }); } finally { setBusy(""); }
  }

  if (!config) return <div className="source-empty platform-loading">正在读取邮件与客服全局配置…</div>;
  return <div className="mail-settings-page">{notice && <div className={`toast ${notice.kind}`}><span>{notice.kind === "ok" ? "✓" : "!"}</span>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}
    <section className="card mail-service-head"><div><p className="section-kicker">GLOBAL SUPPORT CONTROL</p><h2>全局官网客服与邮件服务</h2><p>官网客服属于平台全局能力，由超级管理员统一控制默认展开、欢迎语、快捷问题，以及企业是否可以绑定客服通知邮箱。</p></div><span className={config.homepageWidget.enabled ? "live-badge" : "warn-badge"}>{config.homepageWidget.enabled ? "官网客服已启用" : "官网客服已关闭"}</span></section>

    <form className="card settings-form mail-settings-form" onSubmit={saveSupportSettings}>
      <div className="card-head"><div><p className="section-kicker">WEBSITE WIDGET</p><h2>全局 AI 客服配置</h2></div></div>
      <section className="mail-toggle-grid"><label className="reuse-secret"><input type="checkbox" checked={config.homepageWidget.enabled} onChange={(event) => updateWidget({ enabled: event.target.checked })}/><span><b>启用全局客服 Widget</b><small>关闭后官网和站内页面都不显示客服入口。</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.homepageWidget.autoOpen} onChange={(event) => updateWidget({ autoOpen: event.target.checked })}/><span><b>首次访问默认展开</b><small>用户手动关闭后会记住状态，切换页面不会再次主动弹出。</small></span></label></section>
      <div className="field-grid"><div><label>客服名称</label><input value={config.homepageWidget.title} onChange={(event) => updateWidget({ title: event.target.value })}/></div><div><label>企业客服邮件权限</label><label className="reuse-secret"><input type="checkbox" checked={config.supportEmailAllowed} onChange={(event) => update({ supportEmailAllowed: event.target.checked })}/><span><b>允许企业绑定客服邮箱</b><small>企业端开启后，使用平台 SMTP 发送工单/转人工/SLA 通知。</small></span></label></div></div>
      <label>默认欢迎语</label><textarea rows={3} value={config.homepageWidget.welcomeMessage} onChange={(event) => updateWidget({ welcomeMessage: event.target.value })}/>
      <label>快捷问题（每行一个，最多 8 个）</label><textarea rows={4} value={quickQuestionsText} onChange={(event) => setQuickQuestionsText(event.target.value)} placeholder={'了解套餐\n预约演示\nRAG 怎么用\n支持私有化吗'}/>
      <div className="form-actions"><button className="primary-button fit" disabled={busy === "support"}>{busy === "support" ? "保存中…" : "保存全局客服配置"}</button></div>
    </form>

    <section className="card mail-service-head"><div><p className="section-kicker">SMTP & VERIFICATION</p><h2>SMTP 邮件与验证码</h2><p>统一管理注册验证码、邮箱登录、订单通知与客服运营通知。企业账号不能查看或修改 SMTP 授权码。</p></div><span className={config.enabled && config.deliveryReady ? "live-badge" : "warn-badge"}>{config.enabled && config.deliveryReady ? `发送就绪 · ${config.deliveryMode === "direct_smtp" ? "直接 SMTP" : "HTTPS 中继"}` : "待配置"}</span></section>
    <form className="card settings-form mail-settings-form" onSubmit={save}>
      <section className="mail-toggle-grid"><label className="reuse-secret"><input type="checkbox" checked={config.enabled} onChange={(event) => update({ enabled: event.target.checked })}/><span><b>启用邮件发送</b><small>关闭后注册、邮箱验证码与客服邮件通知都会暂停。</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.orderNotifications} onChange={(event) => update({ orderNotifications: event.target.checked })}/><span><b>启用订单邮件通知</b><small>支付、续费和退款状态变化可通知企业账单邮箱。</small></span></label></section>
      <div className="field-grid"><div><label>SMTP 主机</label><input value={config.host} onChange={(event) => update({ host: event.target.value })}/></div><div><label>SMTP 端口</label><input type="number" min="1" max="65535" value={config.port} onChange={(event) => update({ port: Number(event.target.value) })}/></div><div><label>SMTP 用户名</label><input type="email" value={config.username} onChange={(event) => update({ username: event.target.value })} autoComplete="off"/></div><div><label>SMTP 授权码<span>{config.passwordConfigured ? `已配置 ${config.passwordHint || ""}；留空不修改` : "不是邮箱登录密码"}</span></label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={config.passwordConfigured ? "留空保留现有授权码" : "填写 SMTP 授权码"} autoComplete="new-password"/></div><div><label>发件邮箱</label><input type="email" value={config.fromEmail} onChange={(event) => update({ fromEmail: event.target.value })}/></div><div><label>发件人名称</label><input value={config.fromName} onChange={(event) => update({ fromName: event.target.value })}/></div></div>
      <div className="mail-protocol-row"><label className="reuse-secret"><input type="checkbox" checked={config.useSsl} onChange={(event) => update({ useSsl: event.target.checked, ...(event.target.checked ? { useStarttls: false } : {}) })}/><span><b>启用 SSL</b><small>QQ 邮箱 465 端口推荐</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.useStarttls} onChange={(event) => update({ useStarttls: event.target.checked, ...(event.target.checked ? { useSsl: false } : {}) })}/><span><b>启用 STARTTLS</b><small>通常用于 587 端口</small></span></label></div>
      <fieldset className="merchant-fieldset"><legend>HTTPS 邮件中继（可选）</legend><p className="mail-relay-note">托管站点默认通过 Cloudflare TCP Sockets 直接连接 465/587；Linux、Windows 私有部署也可使用内置中继。只有填写完整地址和令牌时才切换到中继。</p><label>中继发送地址</label><input type="url" value={config.relayUrl} onChange={(event) => update({ relayUrl: event.target.value })} placeholder="留空使用直接 SMTP"/><label>中继访问令牌<span>{config.relayTokenConfigured ? `已配置 ${config.relayTokenHint || ""}；留空不修改` : "仅使用中继时填写"}</span></label><input type="password" value={relayToken} onChange={(event) => setRelayToken(event.target.value)} placeholder={config.relayTokenConfigured ? "留空保留现有令牌" : "可选中继令牌"} autoComplete="new-password"/></fieldset>
      <fieldset className="merchant-fieldset"><legend>验证码策略</legend><div className="verification-policy-grid"><div><label>过期时间（分钟）</label><input type="number" min="1" max="30" value={config.codeExpiryMinutes} onChange={(event) => update({ codeExpiryMinutes: Number(event.target.value) })}/></div><div><label>重发间隔（秒）</label><input type="number" min="30" max="600" value={config.resendSeconds} onChange={(event) => update({ resendSeconds: Number(event.target.value) })}/></div><div><label>最大尝试次数</label><input type="number" min="1" max="10" value={config.maxAttempts} onChange={(event) => update({ maxAttempts: Number(event.target.value) })}/></div><div><label>验证码长度</label><input type="number" min="4" max="8" value={config.codeLength} onChange={(event) => update({ codeLength: Number(event.target.value) })}/></div></div></fieldset>
      <div className="form-actions"><button className="primary-button fit" disabled={busy === "save"}>{busy === "save" ? "保存中…" : "保存邮件配置"}</button><span className="config-source">当前来源：{config.source === "environment" ? "部署环境密钥" : config.source === "database" ? "超级管理员配置" : "默认参数"}</span></div>
    </form>
    <section className="card mail-test-card"><div><p className="section-kicker">DELIVERY TEST</p><h2>测试发送</h2><p>保存后向指定邮箱发送一封真实测试邮件，同时校验 SMTP 与中继。</p></div><div className="mail-test-action"><input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="输入收件邮箱"/><button className="secondary-button" type="button" disabled={busy === "test" || !config.enabled} onClick={() => void test()}>{busy === "test" ? "发送中…" : "发送测试邮件"}</button></div></section>
  </div>;
}
