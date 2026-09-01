"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type MailConfig = {
  enabled: boolean; host: string; port: number; username: string; passwordConfigured: boolean; passwordHint: string | null;
  fromEmail: string; fromName: string; useSsl: boolean; useStarttls: boolean; relayUrl: string; relayTokenConfigured: boolean;
  relayTokenHint: string | null; relayReady: boolean; directSmtpReady: boolean; deliveryReady: boolean; deliveryMode: "direct_smtp" | "https_relay";
  codeExpiryMinutes: number; resendSeconds: number; maxAttempts: number;
  codeLength: number; orderNotifications: boolean; source: string; updatedAt: string | null;
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init); const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export default function MailSettings() {
  const [config, setConfig] = useState<MailConfig | null>(null); const [password, setPassword] = useState(""); const [relayToken, setRelayToken] = useState("");
  const [testEmail, setTestEmail] = useState(""); const [busy, setBusy] = useState(""); const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => setConfig(await api<MailConfig>("/api/platform/mail")), []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((error) => setNotice({ kind: "error", text: error instanceof Error ? error.message : "邮件配置加载失败" })), 0); return () => window.clearTimeout(timer); }, [load]);

  function update(patch: Partial<MailConfig>) { setConfig((current) => current ? { ...current, ...patch } : current); }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!config) return; setBusy("save"); setNotice(null);
    try {
      const saved = await api<MailConfig>("/api/platform/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", ...config, password, relayToken }) });
      setConfig(saved); setPassword(""); setRelayToken(""); setNotice({ kind: "ok", text: saved.deliveryReady ? `邮件配置已保存，当前使用${saved.deliveryMode === "direct_smtp" ? "直接 SMTP" : "HTTPS 中继"}发送。` : "SMTP 参数已保存，但发送条件尚不完整。" });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); } finally { setBusy(""); }
  }

  async function test() {
    if (!testEmail.trim()) return setNotice({ kind: "error", text: "请输入测试收件邮箱。" });
    setBusy("test"); setNotice(null);
    try { const data = await api<{ message: string }>("/api/platform/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", to: testEmail }) }); setNotice({ kind: "ok", text: data.message }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "测试发送失败" }); } finally { setBusy(""); }
  }

  if (!config) return <div className="source-empty platform-loading">正在读取邮件服务配置…</div>;
  return <div className="mail-settings-page">{notice && <div className={`toast ${notice.kind}`}><span>{notice.kind === "ok" ? "✓" : "!"}</span>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}
    <section className="card mail-service-head"><div><p className="section-kicker">SMTP & VERIFICATION</p><h2>SMTP 邮件与验证码</h2><p>统一管理注册验证码、邮箱登录和订单通知。企业账号不能查看或修改授权码。</p></div><span className={config.enabled && config.deliveryReady ? "live-badge" : "warn-badge"}>{config.enabled && config.deliveryReady ? `发送就绪 · ${config.deliveryMode === "direct_smtp" ? "直接 SMTP" : "HTTPS 中继"}` : "待配置"}</span></section>
    <form className="card settings-form mail-settings-form" onSubmit={save}>
      <section className="mail-toggle-grid"><label className="reuse-secret"><input type="checkbox" checked={config.enabled} onChange={(event) => update({ enabled: event.target.checked })}/><span><b>启用邮件发送</b><small>关闭后注册与邮箱验证码登录暂停，账号密码登录不受影响。</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.orderNotifications} onChange={(event) => update({ orderNotifications: event.target.checked })}/><span><b>启用订单邮件通知</b><small>支付、续费和退款状态变化可通知企业账单邮箱。</small></span></label></section>
      <div className="field-grid"><div><label>SMTP 主机</label><input value={config.host} onChange={(event) => update({ host: event.target.value })}/></div><div><label>SMTP 端口</label><input type="number" min="1" max="65535" value={config.port} onChange={(event) => update({ port: Number(event.target.value) })}/></div><div><label>SMTP 用户名</label><input type="email" value={config.username} onChange={(event) => update({ username: event.target.value })} autoComplete="off"/></div><div><label>SMTP 授权码<span>{config.passwordConfigured ? `已配置 ${config.passwordHint || ""}；留空不修改` : "不是邮箱登录密码"}</span></label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={config.passwordConfigured ? "留空保留现有授权码" : "填写 SMTP 授权码"} autoComplete="new-password"/></div><div><label>发件邮箱</label><input type="email" value={config.fromEmail} onChange={(event) => update({ fromEmail: event.target.value })}/></div><div><label>发件人名称</label><input value={config.fromName} onChange={(event) => update({ fromName: event.target.value })}/></div></div>
      <div className="mail-protocol-row"><label className="reuse-secret"><input type="checkbox" checked={config.useSsl} onChange={(event) => update({ useSsl: event.target.checked, ...(event.target.checked ? { useStarttls: false } : {}) })}/><span><b>启用 SSL</b><small>QQ 邮箱 465 端口推荐</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.useStarttls} onChange={(event) => update({ useStarttls: event.target.checked, ...(event.target.checked ? { useSsl: false } : {}) })}/><span><b>启用 STARTTLS</b><small>通常用于 587 端口</small></span></label></div>
      <fieldset className="merchant-fieldset"><legend>HTTPS 邮件中继（可选）</legend><p className="mail-relay-note">托管站点默认通过 Cloudflare TCP Sockets 直接连接 465/587；Linux、Windows 私有部署也可使用内置中继。只有填写完整地址和令牌时才切换到中继。</p><label>中继发送地址</label><input type="url" value={config.relayUrl} onChange={(event) => update({ relayUrl: event.target.value })} placeholder="留空使用直接 SMTP"/><label>中继访问令牌<span>{config.relayTokenConfigured ? `已配置 ${config.relayTokenHint || ""}；留空不修改` : "仅使用中继时填写"}</span></label><input type="password" value={relayToken} onChange={(event) => setRelayToken(event.target.value)} placeholder={config.relayTokenConfigured ? "留空保留现有令牌" : "可选中继令牌"} autoComplete="new-password"/></fieldset>
      <fieldset className="merchant-fieldset"><legend>验证码策略</legend><div className="verification-policy-grid"><div><label>过期时间（分钟）</label><input type="number" min="1" max="30" value={config.codeExpiryMinutes} onChange={(event) => update({ codeExpiryMinutes: Number(event.target.value) })}/></div><div><label>重发间隔（秒）</label><input type="number" min="30" max="600" value={config.resendSeconds} onChange={(event) => update({ resendSeconds: Number(event.target.value) })}/></div><div><label>最大尝试次数</label><input type="number" min="1" max="10" value={config.maxAttempts} onChange={(event) => update({ maxAttempts: Number(event.target.value) })}/></div><div><label>验证码长度</label><input type="number" min="4" max="8" value={config.codeLength} onChange={(event) => update({ codeLength: Number(event.target.value) })}/></div></div></fieldset>
      <div className="form-actions"><button className="primary-button fit" disabled={busy === "save"}>{busy === "save" ? "保存中…" : "保存邮件配置"}</button><span className="config-source">当前来源：{config.source === "environment" ? "部署环境密钥" : config.source === "database" ? "超级管理员配置" : "默认参数"}</span></div>
    </form>
    <section className="card mail-test-card"><div><p className="section-kicker">DELIVERY TEST</p><h2>测试发送</h2><p>保存后向指定邮箱发送一封真实测试邮件，同时校验 SMTP 与中继。</p></div><div className="mail-test-action"><input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="输入收件邮箱"/><button className="secondary-button" type="button" disabled={busy === "test" || !config.enabled} onClick={() => void test()}>{busy === "test" ? "发送中…" : "发送测试邮件"}</button></div></section>
  </div>;
}
