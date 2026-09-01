"use client";

import { FormEvent, useState } from "react";

export default function SetupClient({ email, initialName }: { email: string; initialName: string }) {
  const [form, setForm] = useState({ displayName: initialName, companyName: "KnowFlow 自营工作区", password: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); if (form.password !== form.confirmPassword) return setError("两次输入的密码不一致。"); setBusy(true);
    try {
      const response = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok || !data.redirectTo) throw new Error(data.error || "激活失败。"); window.location.assign(data.redirectTo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "激活失败。"); setBusy(false); }
  }
  return <main className="auth-single"><section className="auth-card auth-register-card"><div className="auth-card-head"><span className="brand-mark">K</span><div><p className="section-kicker">One-time activation</p><h1>激活超级管理员</h1></div></div><div className="setup-owner"><span>已验证所有者</span><b>{email}</b></div>{error && <div className="auth-error">{error}</div>}<form className="settings-form" onSubmit={submit}><div className="field-grid"><div><label>管理员姓名</label><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required/></div><div><label>自营企业工作区</label><input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} required/></div></div><div className="field-grid"><div><label>超级管理员密码<span>至少 10 位，同时包含字母和数字</span></label><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required/></div><div><label>确认密码</label><input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required/></div></div><div className="security-warning"><b>只执行一次</b><span>激活后 `/setup` 自动关闭；后续从 `/platform/login` 登录超级管理员后台。</span></div><button className="primary-button" disabled={busy}>{busy ? "正在创建安全账号…" : "创建超级管理员并进入平台"}</button></form></section></main>;
}
