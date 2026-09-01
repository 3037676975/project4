"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AuthSlider from "../auth-slider";

type LoginPortal = "platform" | "admin" | "workspace";
const portalCopy = {
  platform: { kicker: "PLATFORM OWNER", title: "超级管理员登录", button: "进入超级管理员控制台", badge: "平台经营与全局控制", description: "仅限站点超级管理员。登录后可以切换平台控制台、内部管理台和所属企业工作台。" },
  admin: { kicker: "OPERATIONS TEAM", title: "内部管理员登录", button: "进入内部管理台", badge: "运营 / 财务 / 客服 / 风控", description: "仅处理平台运营任务，不显示超级管理员的商户、模型、邮件与全局权限配置。" },
  workspace: { kicker: "ENTERPRISE WORKSPACE", title: "企业账号登录", button: "进入企业工作台", badge: "企业专属后台", description: "企业所有者、管理员和成员只访问自己所属企业的知识库、AI 客服与经营数据。" },
};

export default function LoginClient({ loggedOut, errorCode, portal }: { loggedOut: boolean; errorCode: string; portal: LoginPortal }) {
  const [mode, setMode] = useState<"password" | "email_code">("password");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [slider, setSlider] = useState({ challengeId: "", sliderTicket: "" }); const [sliderReset, setSliderReset] = useState(0);
  const [resend, setResend] = useState(0); const [codeNotice, setCodeNotice] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(errorCode === "forbidden" ? "当前账号没有该后台权限。" : errorCode === "no_workspace" ? "账号尚未加入企业工作区。" : "");
  const copy = portalCopy[portal];

  useEffect(() => {
    if (resend <= 0) return;
    const timer = window.setInterval(() => setResend((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resend]);

  async function sendCode() {
    setError(""); setCodeNotice("");
    if (!email.trim()) return setError("请先输入登录邮箱。");
    if (!slider.challengeId || !slider.sliderTicket) return setError("请先完成滑块验证。");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, purpose: "login", portal, ...slider }) });
      const data = await response.json() as { error?: string; resendSeconds?: number };
      if (!response.ok) throw new Error(data.error || "验证码发送失败。");
      setResend(Number(data.resendSeconds || 60)); setCodeNotice("验证码已发送，请查看邮箱。每个验证码仅可使用一次。");
      setSlider({ challengeId: "", sliderTicket: "" }); setSliderReset((value) => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "验证码发送失败。"); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, code, mode, portal }) });
      const data = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok || !data.redirectTo) throw new Error(data.error || "登录失败。");
      window.location.assign(data.redirectTo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "登录失败。"); setBusy(false); }
  }

  return <main className="auth-page auth-glass-page">
    <section className="auth-brand-panel">
      <Link className="auth-brand" href="/"><span className="brand-mark">◆</span><b>KnowFlow</b></Link>
      <div className="auth-brand-copy"><p className="section-kicker">ENTERPRISE AI SERVICE PLATFORM</p><h1>让企业知识，成为可靠的服务能力</h1><p>可信回答、来源可追溯、企业数据隔离，并支持私有化部署。</p></div>
      <div className="auth-product-preview"><header><span>✦</span><b>可信回答</b><em>98%</em></header><div className="auth-preview-question">产品是否支持私有化部署？</div><article><span>AI</span><p>支持。数据与模型均可部署在企业环境中。</p></article><footer><span><i/> 来源可追溯</span><b>3 项依据</b></footer></div>
      <div className="auth-trust-row"><span>✓ 可信回答</span><span>⌁ 来源可追溯</span><span>▣ 私有化部署</span></div>
    </section>
    <section className="auth-form-panel">
      <form className="auth-card role-separated-login" onSubmit={submit}>
        <div className="portal-identity"><span>{portal === "platform" ? "超" : portal === "admin" ? "管" : "企"}</span><div><small>当前独立入口</small><b>{copy.badge}</b></div></div>
        <div className="auth-card-head"><span className="brand-mark">◆</span><div><p className="section-kicker">{copy.kicker}</p><h2>{copy.title}</h2></div></div>
        <p className="auth-portal-description">{copy.description}</p>
        <div className="auth-mode-tabs"><button type="button" className={mode === "password" ? "active" : ""} onClick={() => { setMode("password"); setError(""); }}>账号密码</button><button type="button" className={mode === "email_code" ? "active" : ""} onClick={() => { setMode("email_code"); setError(""); }}>邮箱验证码</button></div>
        {loggedOut && <div className="auth-success">已安全退出账号。</div>}{error && <div className="auth-error">{error}</div>}{codeNotice && <div className="auth-success">{codeNotice}</div>}
        <label>登录邮箱</label><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required/>
        {mode === "password" ? <><label>密码</label><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入账号密码" required/></> : <>
          <label>安全验证<span>通过后才能发送验证码</span></label><AuthSlider purpose="login" portal={portal} resetKey={String(sliderReset)} onVerified={setSlider}/>
          <label>邮箱验证码</label><div className="auth-code-field"><input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="输入验证码" required/><button type="button" disabled={busy || resend > 0 || !slider.sliderTicket} onClick={() => void sendCode()}>{resend > 0 ? `${resend} 秒` : "发送验证码"}</button></div>
        </>}
        <button className="primary-button" disabled={busy}>{busy ? "正在验证…" : copy.button}</button>
        <div className="auth-links">{portal === "workspace" && <span>没有企业账号？ <Link href="/register">邮箱验证注册企业</Link></span>}<span>入口和权限已分离，当前页面不会跳转到其他角色后台。</span></div>
        {portal === "platform" && <div className="auth-setup"><b>首次部署？</b><span>站点所有者先完成 <Link href="/setup">超级管理员激活</Link></span></div>}
      </form>
    </section>
  </main>;
}
