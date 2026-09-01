import { assertSameOrigin, attachAccountByEmail, authRouteError, createUserAccount, issueSession } from "../../../../lib/app-auth";
import { ensurePlatformAdmin, isPlatformBootstrapEmail } from "../../../../lib/platform-admin";
import { createTenantWorkspace } from "../../../../lib/tenant";
import { getRuntime } from "../../../../lib/runtime";

function forwardedIdentity(request: Request) {
  const email = (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase(); if (!email) return null;
  const encoded = request.headers.get("oai-authenticated-user-full-name"); let displayName = email.split("@")[0];
  if (encoded) { try { displayName = request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8" ? decodeURIComponent(encoded) : encoded; } catch { /* fallback */ } }
  return { email, displayName };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = forwardedIdentity(request);
    if (!identity || !isPlatformBootstrapEmail(identity.email)) return Response.json({ error: "只有站点所有者可以激活首个超级管理员。" }, { status: 403 });
    const existing = await getRuntime().DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(identity.email).first<{ id: string }>();
    if (existing) return Response.json({ error: "超级管理员账号已经激活，请直接登录。" }, { status: 409 });
    const body = await request.json() as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName : identity.displayName;
    const companyName = typeof body.companyName === "string" && body.companyName.trim() ? body.companyName : "KnowFlow 自营工作区";
    const password = typeof body.password === "string" ? body.password : "";
    const account = await createUserAccount({ email: identity.email, displayName, password });
    await attachAccountByEmail(account); await ensurePlatformAdmin(account.email, account.displayName, account.id);
    await createTenantWorkspace({ account, companyName });
    const cookie = await issueSession(request, account.id);
    return Response.json({ activated: true, redirectTo: "/platform" }, { status: 201, headers: { "Set-Cookie": cookie } });
  } catch (error) { return authRouteError(error); }
}
