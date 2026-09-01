"use client";

import { FormEvent, useState } from "react";

export default function AccountClient({ account }: { account: { email: string; displayName: string; mustChangePassword: boolean } }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); if (form.newPassword !== form.confirmPassword) return setError("两次输入的新密码不一致。"); setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok || !data.redirectTo) throw new Error(data.error || "修改失败。"); window.location.assign(data.redirectTo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "修改失败。"); setBusy(false); }
  }
  return <main className="auth-single"><section className="auth-card account-card"><div className="auth-card-head"><span className="brand-mark">K</span><div><p className="section-kicker">Account security</p><h1>{account.mustChangePassword ? "首次登录，请修改密码" : "修改账号密码"}</h1></div></div><div className="setup-owner"><span>{account.displayName}</span><b>{account.email}</b></div>{account.mustChangePassword && <div className="auth-success">管理员创建的是临时密码。修改后才可进入业务后台。</div>}{error && <div className="auth-error">{error}</div>}<form className="settings-form" onSubmit={submit}><label>当前密码</label><input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required/><label>新密码<span>至少 10 位，同时包含字母和数字</span></label><input type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required/><label>确认新密码</label><input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required/><button className="primary-button" disabled={busy}>{busy ? "正在更新…" : "保存新密码"}</button><a className="auth-logout" href="/logout">退出当前账号</a></form></section></main>;
}
