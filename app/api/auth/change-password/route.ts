import { accountAccess, assertSameOrigin, authenticateUser, authRouteError, getSessionAccount, issueSession, resetUserPassword } from "../../../../lib/app-auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const account = await getSessionAccount(request.headers);
    if (!account) return Response.json({ error: "登录已过期，请重新登录。" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const verified = await authenticateUser(account.email, currentPassword);
    if (!verified) return Response.json({ error: "当前密码不正确。" }, { status: 401 });
    if (currentPassword === newPassword) return Response.json({ error: "新密码不能与当前密码相同。" }, { status: 400 });
    await resetUserPassword(account.id, newPassword, false);
    const nextAccount = { ...account, mustChangePassword: false }; const access = await accountAccess(nextAccount);
    const cookie = await issueSession(request, account.id);
    return Response.json({ changed: true, redirectTo: access.destination }, { headers: { "Set-Cookie": cookie } });
  } catch (error) { return authRouteError(error); }
}
