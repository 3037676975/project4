import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { optionalAccount } from "../../lib/page-auth";
import { isPlatformBootstrapEmail } from "../../lib/platform-admin";
import { getRuntime } from "../../lib/runtime";
import SetupClient from "./setup-client";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await optionalAccount()) redirect("/");
  const requestHeaders = await headers(); const email = (requestHeaders.get("oai-authenticated-user-email") || "").trim().toLowerCase();
  if (!email || !isPlatformBootstrapEmail(email)) return <main className="auth-single"><section className="auth-card setup-blocked"><span className="auth-shield">!</span><p className="section-kicker">Owner verification</p><h1>请先验证站点所有者</h1><p>首次激活只允许托管平台中配置的所有者邮箱执行。验证完成后，你将在这里自行设置超级管理员密码，密码不会发送到聊天。</p><a className="primary-button" href="/signin-with-chatgpt?return_to=/setup">验证站点所有者</a><Link href="/platform/login">返回超级管理员登录</Link></section></main>;
  const existing = await getRuntime().DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (existing) return <main className="auth-single"><section className="auth-card setup-blocked"><span className="auth-shield">✓</span><p className="section-kicker">Already activated</p><h1>超级管理员已激活</h1><p>账号 <b>{email}</b> 已经拥有独立密码，请直接登录。</p><Link className="primary-button" href="/platform/login">前往超级管理员登录</Link></section></main>;
  const encoded = requestHeaders.get("oai-authenticated-user-full-name"); let displayName = email.split("@")[0];
  if (encoded) { try { displayName = requestHeaders.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8" ? decodeURIComponent(encoded) : encoded; } catch { /* fallback */ } }
  return <SetupClient email={email} initialName={displayName}/>;
}
