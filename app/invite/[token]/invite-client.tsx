"use client";

import { useState } from "react";
import Link from "next/link";

export default function InviteClient({ token, email }: { token: string; email: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function accept() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/tenant/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json() as { error?: string; tenantId?: string };
      if (!response.ok || !data.tenantId) throw new Error(data.error || "接受邀请失败。");
      localStorage.setItem("knowflow_tenant_id", data.tenantId); window.location.href = "/workspace";
    } catch (caught) { setError(caught instanceof Error ? caught.message : "接受邀请失败。"); setBusy(false); }
  }
  return <main className="invite-page"><section className="card invite-card"><span className="brand-mark">K</span><p className="section-kicker">Enterprise invitation</p><h1>加入 KnowFlow 企业工作区</h1><p>当前登录邮箱：<b>{email}</b></p>{error && <div className="error-state"><p>{error}</p></div>}<button className="primary-button" onClick={accept} disabled={busy}>{busy ? "正在加入…" : "接受企业邀请"}</button><Link href="/workspace">返回企业工作台</Link></section></main>;
}
