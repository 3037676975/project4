"use client";

import { FormEvent, useState } from "react";

function safeReturnTo() {
  const value = new URLSearchParams(window.location.search).get("return_to") || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function LocalLoginClient({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/local-auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "登录失败");
      window.location.assign(safeReturnTo());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); setBusy(false); }
  }

  return <main className="login-shell"><section className="login-card"><div className="brand login-brand"><span className="brand-mark">K</span><span>KnowFlow</span></div><p className="section-kicker">Private deployment</p><h1>超级管理员登录</h1><p className="login-copy">使用初始化脚本写入 <code>.env.private</code> 的本地管理员账号登录。线上 Sites 版使用平台身份，不共用此密码。</p><form className="settings-form" onSubmit={submit}><label>管理员邮箱</label><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required/><label>超级管理员密码</label><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus/>{error && <div className="login-error">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? "正在验证…" : "进入平台"}</button></form><small className="login-help">首次密码由 <code>scripts/init-private</code> 自动生成；仅私有化部署可用。</small></section></main>;
}
