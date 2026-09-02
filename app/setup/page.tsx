import { redirect } from "next/navigation";
import Link from "next/link";
import { getChatGPTUser, chatGPTSignInPath } from "../chatgpt-auth";
import { optionalAccount } from "../../lib/page-auth";
import { isPlatformBootstrapEmail } from "../../lib/platform-admin";
import { getRuntime } from "../../lib/runtime";
import SetupClient from "./setup-client";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await optionalAccount()) redirect("/");

  const identity = await getChatGPTUser();
  if (!identity || !isPlatformBootstrapEmail(identity.email)) {
    const runtime = getRuntime();
    const verificationHref = runtime.APP_ENV === "local"
      ? "/local-login?return_to=%2Fsetup"
      : chatGPTSignInPath("/setup");

    return <main className="auth-single"><section className="auth-card setup-blocked"><span className="auth-shield">!</span><p className="section-kicker">Owner verification</p><h1>请先验证站点所有者</h1><p>首次激活只允许站点所有者执行。私有化部署使用初始化脚本生成的本地管理员账号验证；托管版继续使用平台身份验证。</p><a className="primary-button" href={verificationHref}>验证站点所有者</a><Link href="/platform/login">返回超级管理员登录</Link></section></main>;
  }

  const email = identity.email.trim().toLowerCase();
  const existing = await getRuntime().DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (existing) return <main className="auth-single"><section className="auth-card setup-blocked"><span className="auth-shield">✓</span><p className="section-kicker">Already activated</p><h1>超级管理员已激活</h1><p>账号 <b>{email}</b> 已经拥有独立密码，请直接登录。</p><Link className="primary-button" href="/platform/login">前往超级管理员登录</Link></section></main>;

  return <SetupClient email={email} initialName={identity.displayName || email.split("@")[0]}/>;
}
