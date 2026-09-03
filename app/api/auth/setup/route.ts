import { assertSameOrigin, attachAccountByEmail, authRouteError, createUserAccount, issueSession } from "../../../../lib/app-auth";
import { ensurePlatformAdmin, isPlatformBootstrapEmail } from "../../../../lib/platform-admin";
import { createTenantWorkspace } from "../../../../lib/tenant";
import { getRuntime } from "../../../../lib/runtime";
import { getChatGPTUser } from "../../../chatgpt-auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await getChatGPTUser();
    if (!identity || !isPlatformBootstrapEmail(identity.email)) return Response.json({ error: "只有站点所有者可以激活首个超级管理员。" }, { status: 403 });

    const email = identity.email.trim().toLowerCase();
    const existing = await getRuntime().DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
    if (existing) return Response.json({ error: "超级管理员账号已经激活，请直接登录。" }, { status: 409 });

    const body = await request.json() as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName : identity.displayName;
    const companyName = typeof body.companyName === "string" && body.companyName.trim() ? body.companyName : "KnowFlow 自营工作区";
    const password = typeof body.password === "string" ? body.password : "";

    const account = await createUserAccount({ email, displayName, password });
    await attachAccountByEmail(account);
    await ensurePlatformAdmin(account.email, account.displayName, account.id);
    await createTenantWorkspace({ account, companyName });
    const cookie = await issueSession(request, account.id);

    return Response.json({ activated: true, redirectTo: "/platform" }, { status: 201, headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return authRouteError(error);
  }
}
