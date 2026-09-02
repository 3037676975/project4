import { accountAccess, assertSameOrigin, attachAccountByEmail, authenticateUser, authRouteError, createUserAccount, getActiveAccountByEmail, issueSession, normalizeEmail, portalDestination, recordSuccessfulLogin, resetUserPassword, validLoginPortal } from "../../../../lib/app-auth";
import { consumeEmailCode } from "../../../../lib/auth-verification";
import { verifyLocalCredentials } from "../../../../lib/local-auth";
import { getRuntime } from "../../../../lib/runtime";
import { ensurePlatformAdmin } from "../../../../lib/platform-admin";
import { createTenantWorkspace } from "../../../../lib/tenant";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as { email?: unknown; password?: unknown; code?: unknown; portal?: unknown; mode?: unknown };
    const email = normalizeEmail(typeof body.email === "string" ? body.email : ""); const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code.trim() : ""; const mode = body.mode === "email_code" ? "email_code" : "password";
    const portal = validLoginPortal(body.portal); const requestedPortal = portal === "auto" ? "workspace" : portal;
    if (!email || (mode === "password" ? !password : !code)) return Response.json({ error: mode === "password" ? "请输入邮箱和密码。" : "请输入邮箱验证码。" }, { status: 400 });

    const runtime = getRuntime();
    const localCredentialsValid = mode === "password" && runtime.APP_ENV === "local" && verifyLocalCredentials(email, password);
    let account = mode === "password" ? await authenticateUser(email, password) : await getActiveAccountByEmail(email);

    if (localCredentialsValid) {
      const normalized = email.trim().toLowerCase();
      const existing = await runtime.DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(normalized).first<{ id: string }>();
      if (!existing) {
        account = await createUserAccount({ email: normalized, displayName: runtime.LOCAL_AUTH_NAME || "超级管理员", password, mustChangePassword: false });
        await createTenantWorkspace({ account, companyName: "KnowFlow 本地工作区" });
      } else {
        await resetUserPassword(existing.id, password, false);
        account = await getActiveAccountByEmail(normalized);
      }
      await ensurePlatformAdmin(account.email, account.displayName, account.id);
    }

    if (!account) return Response.json({ error: mode === "password" ? "邮箱或密码不正确。" : "账号不存在或已被禁用。" }, { status: 401 });
    await attachAccountByEmail(account);
    const access = await accountAccess(account); const destination = portalDestination(access, requestedPortal);
    if (!destination) return Response.json({ error: requestedPortal === "platform" ? "该账号不是超级管理员，不能进入平台控制台。" : requestedPortal === "admin" ? "该账号没有内部管理角色。" : "该账号尚未加入企业工作区。" }, { status: 403 });
    if (mode === "email_code") {
      await consumeEmailCode({ email, purpose: "login", portal: requestedPortal, code });
      await recordSuccessfulLogin(account.id);
    }
    const cookie = await issueSession(request, account.id);
    return Response.json({ authenticated: true, redirectTo: destination, mustChangePassword: account.mustChangePassword }, { headers: { "Set-Cookie": cookie } });
  } catch (error) { return authRouteError(error); }
}
