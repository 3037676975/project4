import { getRuntime } from "../../../../lib/runtime";
import { sha256 } from "../../../../lib/security";
import { readIdentity, routeError } from "../../../../lib/tenant";

export async function POST(request: Request) {
  try {
    const identity = await readIdentity(request);
    if (!identity) return Response.json({ error: "请先登录后接受邀请。" }, { status: 401 });
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) return Response.json({ error: "邀请链接无效。" }, { status: 400 });
    const tokenHash = await sha256(token); const { DB } = getRuntime();
    const invitation = await DB.prepare(`SELECT id, tenant_id, email, role, status, expires_at FROM tenant_invitations WHERE token_hash = ? LIMIT 1`)
      .bind(tokenHash).first<{ id: string; tenant_id: string; email: string; role: string; status: string; expires_at: string }>();
    if (!invitation || invitation.status !== "pending") return Response.json({ error: "邀请不存在或已经使用。" }, { status: 404 });
    if (new Date(invitation.expires_at) <= new Date()) return Response.json({ error: "邀请已过期，请企业管理员重新发送。" }, { status: 410 });
    if (invitation.email !== identity.email) return Response.json({ error: `请使用受邀邮箱 ${invitation.email} 登录。` }, { status: 403 });
    const entitlement = await DB.prepare(`SELECT p.member_limit, (SELECT COUNT(*) FROM tenant_members tm WHERE tm.tenant_id = s.tenant_id AND tm.status = 'active') AS used
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1`).bind(invitation.tenant_id).first<{ member_limit: number; used: number }>();
    if ((entitlement?.used ?? 0) >= (entitlement?.member_limit ?? 0)) return Response.json({ error: "企业成员名额已满，请管理员升级套餐或禁用离职成员。" }, { status: 429 });
    const now = new Date().toISOString(); const memberId = `mem_${crypto.randomUUID().replaceAll("-", "")}`;
    await DB.batch([
      DB.prepare(`INSERT INTO tenant_members (id, tenant_id, account_id, email, display_name, role, status, active_knowledge_base_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', (SELECT id FROM knowledge_bases WHERE tenant_id = ? AND status = 'active' ORDER BY is_default DESC, position ASC LIMIT 1), ?, ?)
        ON CONFLICT(tenant_id, email) DO UPDATE SET account_id = COALESCE(excluded.account_id, tenant_members.account_id), display_name = excluded.display_name, role = excluded.role, status = 'active', updated_at = excluded.updated_at`)
        .bind(memberId, invitation.tenant_id, identity.accountId, identity.email, identity.displayName, invitation.role, invitation.tenant_id, now, now),
      DB.prepare("UPDATE tenant_invitations SET status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'pending'").bind(now, invitation.id),
    ]);
    return Response.json({ accepted: true, tenantId: invitation.tenant_id });
  } catch (error) { return routeError(error); }
}
