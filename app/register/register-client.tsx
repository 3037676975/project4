"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AuthSlider from "../auth-slider";

export default function RegisterClient({ inviteToken }: { inviteToken: string }) {
  const [form, setForm] = useState({ companyName: "", displayName: "", email: "", emailCode: "", password: "", confirmPassword: "", termsAccepted: false });
  const [slider, setSlider] = useState({ challengeId: "", sliderTicket: "" }); const [sliderReset, setSliderReset] = useState(0);
  const [resend, setResend] = useState(0); const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  useEffect(() => {
    if (resend <= 0) return;
    const timer = window.setInterval(() => setResend((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resend]);

  async function sendCode() {
    setError(""); setNotice("");
    if (!form.email.trim()) return setError("请先输入注册邮箱。");
    if (!slider.sliderTicket) return setError("请先完成滑块验证。");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email, purpose: "register", portal: "workspace", ...slider }) });
      const data = await response.json() as { error?: string; resendSeconds?: number };
      if (!response.ok) throw new Error(data.error || "验证码发送失败。");
      setResend(Number(data.resendSeconds || 60)); setNotice("验证码已发送到注册邮箱，请在有效期内完成注册。");
      setSlider({ challengeId: "", sliderTicket: "" }); setSliderReset((value) => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "验证码发送失败。"); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (form.password !== form.confirmPassword) return setError("两次输入的密码不一致。");
    if (!form.emailCode) return setError("请输入邮箱验证码。");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, inviteToken }) });
      const data = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok || !data.redirectTo) throw new Error(data.error || "注册失败。");
      window.location.assign(data.redirectTo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "注册失败。"); setBusy(false); }
  }

  return <main className="auth-single auth-glass-page register-glass-page"><section className="auth-card auth-register-card">
    <div className="portal-identity"><span>企</span><div><small>企业独立入口</small><b>邮箱验证注册</b></div></div>
    <div className="auth-card-head"><span className="brand-mark">K</span><div><p className="section-kicker">Enterprise account</p><h1>{inviteToken ? "创建成员账号" : "注册企业工作区"}</h1></div></div>
    <p className="auth-intro">{inviteToken ? "请使用收到邀请的邮箱完成滑块和邮箱验证，注册后自动加入企业。" : "验证企业邮箱后创建所有者账号，系统会自动准备免费套餐、默认知识库和 AI 助手。"}</p>
    {error && <div className="auth-error">{error}</div>}{notice && <div className="auth-success">{notice}</div>}
    <form className="settings-form" onSubmit={submit}>
      {!inviteToken && <><label>企业名称</label><input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} placeholder="例如：星云科技有限公司" required/></>}
      <div className="field-grid"><div><label>姓名</label><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="真实姓名" required/></div><div><label>企业邮箱</label><input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@company.com" required/></div></div>
      <label>安全验证<span>必须先通过滑块，才能发送注册验证码</span></label><AuthSlider purpose="register" portal="workspace" resetKey={String(sliderReset)} onVerified={setSlider}/>
      <label>邮箱验证码</label><div className="auth-code-field"><input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={form.emailCode} onChange={(event) => setForm({ ...form, emailCode: event.target.value.replace(/\D/g, "") })} placeholder="输入邮箱验证码" required/><button type="button" disabled={busy || resend > 0 || !slider.sliderTicket} onClick={() => void sendCode()}>{resend > 0 ? `${resend} 秒` : "发送验证码"}</button></div>
      <div className="field-grid"><div><label>密码<span>至少 10 位，同时包含字母和数字</span></label><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required/></div><div><label>确认密码</label><input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required/></div></div>
      <label className="reuse-secret auth-consent"><input type="checkbox" checked={form.termsAccepted} onChange={(event) => setForm({ ...form, termsAccepted: event.target.checked })}/><span><b>同意服务条款与隐私说明</b><small>仅收集提供服务所需的账号、企业和使用记录，并支持企业数据导出与删除。</small></span></label>
      <button className="primary-button" disabled={busy || !form.termsAccepted}>{busy ? "正在创建…" : inviteToken ? "创建账号并加入企业" : "验证并创建企业账号"}</button>
    </form><p className="auth-back">已有账号？ <Link href="/workspace/login">返回企业登录</Link></p>
  </section></main>;
}
