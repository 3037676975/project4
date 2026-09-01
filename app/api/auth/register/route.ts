import { accountAccess, assertSameOrigin, attachAccountByEmail, authRouteError, createUserAccount, issueSession, normalizeEmail, validateEmail } from "../../../../lib/app-auth";
import { createTenantWorkspace } from "../../../../lib/tenant";
import { getRuntime } from "../../../../lib/runtime";
import { sha256 } from "../../../../lib/security";
import { isPlatformBootstrapEmail } from "../../../../lib/platform-admin";
import { consumeEmailCode } from "../../../../lib/auth-verification";

type InvitationRow = { id: string; tenant_id: string; email: string; role: string; status: string; expires_at: string };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as Record<string, unknown>;
    const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
    const displayName = typeof body.displayName === "string" ? body.displayName : "";
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const emailCode = typeof body.emailCode === "string" ? body.emailCode.trim() : "";
    const inviteToken = typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";
    if (body.termsAccepted !== true) return Response.json({ error: "请先同意服务条款与隐私说明。" }, { status: 400 });
    if (!validateEmail(email)) return Response.json({ error: "请输入有效邮箱。" }, { status: 400 });
    if (!emailCode) return Response.json({ error: "请输入邮箱验证码。" }, { status: 400 });
    if (isPlatformBootstrapEmail(email)) return Response.json({ error: "站点所有者邮箱必须通过 /setup 完成首次激活。" }, { status: 403 });
    const { DB } = getRuntime();
    let invitation: InvitationRow | null = null;
    if (inviteToken) {
      invitation = await DB.prepare("SELECT id, tenant_id, email, role, status, expires_at FROM tenant_invitations WHERE token_hash = ? LIMIT 1")
        .bind(await sha256(inviteToken)).first<InvitationRow>();
      if (!invitation || invitation.status !== "pending") return Response.json({ error: "邀请链接不存在或已使用。" }, { status: 404 });
      if (new Date(invitation.expires_at) <= new Date()) return Response.json({ error: "邀请链接已过期，请管理员重新创建。" }, { status: 410 });
      if (invitation.email !== email) return Response.json({ error: `请使用受邀邮箱 ${invitation.email} 注册。` }, { status: 403 });
    } else if (!companyName) return Response.json({ error: "请输入企业名称。" }, { status: 400 });

    await consumeEmailCode({ email, purpose: "register", portal: "workspace", code: emailCode });
    const account = await createUserAccount({ email, displayName, password, verified: true });
    if (invitation) {
      const now = new Date().toISOString(); const memberId = `mem_${crypto.randomUUID().replaceAll("-", "")}`;
      await DB.batch([
        DB.prepare(`INSERT INTO tenant_members (id, tenant_id, account_id, email, display_name, role, status, active_knowledge_base_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', (SELECT id FROM knowledge_bases WHERE tenant_id = ? AND status = 'active' ORDER BY is_default DESC, position ASC LIMIT 1), ?, ?)
          ON CONFLICT(tenant_id, email) DO UPDATE SET account_id = excluded.account_id, display_name = excluded.display_name, role = excluded.role, status = 'active', updated_at = excluded.updated_at`)
          .bind(memberId, invitation.tenant_id, account.id, account.email, account.displayName, invitation.role, invitation.tenant_id, now, now),
        DB.prepare("UPDATE tenant_invitations SET status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'pending'").bind(now, invitation.id),
      ]);
    } else await createTenantWorkspace({ account, companyName });
    await attachAccountByEmail(account);
    const access = await accountAccess(account); const cookie = await issueSession(request, account.id);
    return Response.json({ registered: true, redirectTo: access.destination }, { status: 201, headers: { "Set-Cookie": cookie } });
  } catch (error) { return authRouteError(error); }
}
