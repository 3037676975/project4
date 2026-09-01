import { accountAccess, assertSameOrigin, authRouteError, getActiveAccountByEmail, normalizeEmail, portalDestination, validLoginPortal, validateEmail } from "../../../../lib/app-auth";
import { issueEmailCode, validVerificationPurpose } from "../../../../lib/auth-verification";
import { isPlatformBootstrapEmail } from "../../../../lib/platform-admin";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as Record<string, unknown>; const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
    const purpose = validVerificationPurpose(body.purpose); const portal = validLoginPortal(body.portal);
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const sliderTicket = typeof body.sliderTicket === "string" ? body.sliderTicket : "";
    if (!validateEmail(email)) return Response.json({ error: "请输入有效邮箱。" }, { status: 400 });
    if (!challengeId || !sliderTicket) return Response.json({ error: "请先完成滑块验证。" }, { status: 403 });
    if (purpose === "register") {
      if (isPlatformBootstrapEmail(email)) return Response.json({ error: "站点所有者请使用超级管理员激活入口。" }, { status: 403 });
      if (await getActiveAccountByEmail(email, true)) return Response.json({ error: "该邮箱已经注册，请直接登录。" }, { status: 409 });
    } else {
      const account = await getActiveAccountByEmail(email);
      if (!account) return Response.json({ error: "账号不存在或已被禁用。" }, { status: 404 });
      const access = await accountAccess(account);
      if (!portalDestination(access, portal === "auto" ? "workspace" : portal)) return Response.json({ error: "该账号没有当前后台权限。" }, { status: 403 });
    }
    return Response.json(await issueEmailCode(request, { email, purpose, portal, challengeId, sliderTicket }));
  } catch (error) { return authRouteError(error); }
}
