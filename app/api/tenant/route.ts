import { getRuntime } from "../../../lib/runtime";
import { createTenantInvitation, getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";
import { createUserAccount, resetUserPassword } from "../../../lib/app-auth";

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime();
    const workspaceQuery = DB.prepare(`SELECT t.id, t.name, t.slug, tm.role FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
      WHERE (tm.account_id = ? OR (tm.account_id IS NULL AND tm.email = ?)) AND tm.status = 'active' AND t.status = 'active' ORDER BY t.name`)
      .bind(context.accountId, context.email);
    const [tenant, members, workspaces, invitations] = await Promise.all([
      DB.prepare("SELECT id, name, slug, status, credits_balance, company_name, billing_email, privacy_retention_days, onboarding_completed, created_at FROM tenants WHERE id = ?").bind(context.tenantId).first<Record<string, unknown>>(),
      DB.prepare(`SELECT tm.id, tm.account_id, tm.email, tm.display_name, tm.role, tm.status, tm.created_at,
        ua.must_change_password, ua.last_login_at FROM tenant_members tm LEFT JOIN user_accounts ua ON ua.id = tm.account_id
        WHERE tm.tenant_id = ? ORDER BY tm.created_at`).bind(context.tenantId).all(),
      workspaceQuery.all(),
      DB.prepare(`SELECT id, email, role, status, expires_at, created_at FROM tenant_invitations
        WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 30`).bind(context.tenantId).all(),
    ]);
    return Response.json({ tenant: { id: tenant?.id, name: tenant?.name, slug: tenant?.slug, status: tenant?.status, creditsBalance: tenant?.credits_balance,
      companyName: tenant?.company_name, billingEmail: tenant?.billing_email, privacyRetentionDays: tenant?.privacy_retention_days,
      onboardingCompleted: Boolean(tenant?.onboarding_completed), createdAt: tenant?.created_at },
      currentUser: { email: context.email, displayName: context.displayName, role: context.role },
      workspaces: (workspaces.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, name: row.name, slug: row.slug, role: row.role })),
      members: (members.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, accountId: row.account_id, email: row.email, displayName: row.display_name, role: row.role, status: row.status, mustChangePassword: Boolean(row.must_change_password), lastLoginAt: row.last_login_at, createdAt: row.created_at })),
      invitations: (invitations.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, email: row.email, role: row.role, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at })) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const body = await request.json() as { action?: unknown; email?: unknown; displayName?: unknown; temporaryPassword?: unknown; role?: unknown; memberId?: unknown; name?: unknown; companyName?: unknown; billingEmail?: unknown; privacyRetentionDays?: unknown };
    const { DB } = getRuntime(); const now = new Date().toISOString();
    if (body.action === "member_role") {
      const memberId = typeof body.memberId === "string" ? body.memberId : "";
      const role = body.role === "admin" || body.role === "viewer" ? body.role : "member";
      const target = await DB.prepare("SELECT id, email, role, status FROM tenant_members WHERE tenant_id = ? AND id = ?")
        .bind(context.tenantId, memberId).first<{ id: string; email: string; role: string; status: string }>();
      if (!target || target.status !== "active") return Response.json({ error: "有效成员不存在。" }, { status: 404 });
      if (target.role === "owner" || target.email === context.email) return Response.json({ error: "不能修改工作区所有者或当前账号的角色。" }, { status: 400 });
      if (context.role !== "owner" && (target.role === "admin" || role === "admin")) return Response.json({ error: "只有工作区所有者可以授予或修改管理员角色。" }, { status: 403 });
      await DB.prepare("UPDATE tenant_members SET role = ?, updated_at = ? WHERE tenant_id = ? AND id = ?").bind(role, now, context.tenantId, memberId).run();
      return Response.json({ saved: true, role });
    }
    if (body.action === "member_password_reset") {
      const memberId = typeof body.memberId === "string" ? body.memberId : "";
      const temporaryPassword = typeof body.temporaryPassword === "string" ? body.temporaryPassword : "";
      const target = await DB.prepare("SELECT id, account_id, email, role, status FROM tenant_members WHERE tenant_id = ? AND id = ?")
        .bind(context.tenantId, memberId).first<{ id: string; account_id: string | null; email: string; role: string; status: string }>();
      if (!target || target.status !== "active") return Response.json({ error: "有效成员不存在。" }, { status: 404 });
      if (!target.account_id) return Response.json({ error: "该成员尚未绑定站内账号，请重新创建。" }, { status: 409 });
      if (target.email === context.email) return Response.json({ error: "当前账号请在账号安全页自行修改密码。" }, { status: 400 });
      if (target.role === "owner" && context.role !== "owner") return Response.json({ error: "只有企业所有者可以重置所有者密码。" }, { status: 403 });
      await resetUserPassword(target.account_id, temporaryPassword, true);
      return Response.json({ saved: true });
    }
    if (body.action === "rename") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      if (!name) return Response.json({ error: "工作区名称不能为空。" }, { status: 400 });
      await DB.prepare("UPDATE tenants SET name = ?, updated_at = ? WHERE id = ?").bind(name, now, context.tenantId).run();
      return Response.json({ saved: true, name });
    }
    if (body.action === "onboarding") {
      const companyName = typeof body.companyName === "string" ? body.companyName.trim().slice(0, 120) : "";
      const billingEmail = typeof body.billingEmail === "string" ? body.billingEmail.trim().toLowerCase().slice(0, 160) : "";
      const retention = Math.max(30, Math.min(1095, Math.round(Number(body.privacyRetentionDays || 180))));
      if (!companyName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) return Response.json({ error: "请填写企业名称和有效账单邮箱。" }, { status: 400 });
      await DB.prepare(`UPDATE tenants SET name = ?, company_name = ?, billing_email = ?, privacy_retention_days = ?, onboarding_completed = 1, updated_at = ? WHERE id = ?`)
        .bind(companyName, companyName, billingEmail, retention, now, context.tenantId).run();
      return Response.json({ saved: true, companyName, billingEmail, privacyRetentionDays: retention });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role === "admin" || body.role === "viewer" ? body.role : "member";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "请输入有效邮箱。" }, { status: 400 });
    const entitlement = await DB.prepare(`SELECT p.member_limit,
      (SELECT COUNT(*) FROM tenant_members tm WHERE tm.tenant_id = s.tenant_id AND tm.status = 'active') +
      (SELECT COUNT(*) FROM tenant_invitations ti WHERE ti.tenant_id = s.tenant_id AND ti.status = 'pending' AND ti.expires_at > ?) AS used
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? AND s.status = 'active'
      ORDER BY s.created_at DESC LIMIT 1`).bind(now, context.tenantId).first<{ member_limit: number; used: number }>();
    if ((entitlement?.used ?? 0) >= (entitlement?.member_limit ?? 0)) return Response.json({ error: "已达到当前套餐的成员上限。" }, { status: 429 });
    if (body.action === "member_create") {
      const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
      const temporaryPassword = typeof body.temporaryPassword === "string" ? body.temporaryPassword : "";
      if (!displayName) return Response.json({ error: "请输入成员姓名。" }, { status: 400 });
      const activeMember = await DB.prepare("SELECT id FROM tenant_members WHERE tenant_id = ? AND email = ? AND status = 'active' LIMIT 1")
        .bind(context.tenantId, email).first<{ id: string }>();
      if (activeMember) return Response.json({ error: "该邮箱已经是企业成员。" }, { status: 409 });
      let account = await DB.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>(); let accountCreated = false;
      if (!account) { account = await createUserAccount({ email, displayName, password: temporaryPassword, mustChangePassword: true }); accountCreated = true; }
      const memberId = `mem_${crypto.randomUUID().replaceAll("-", "")}`;
      await DB.prepare(`INSERT INTO tenant_members (id, tenant_id, account_id, email, display_name, role, status, active_knowledge_base_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', (SELECT id FROM knowledge_bases WHERE tenant_id = ? AND status = 'active' ORDER BY is_default DESC, position ASC LIMIT 1), ?, ?)
        ON CONFLICT(tenant_id, email) DO UPDATE SET account_id = excluded.account_id, display_name = excluded.display_name, role = excluded.role, status = 'active', updated_at = excluded.updated_at`)
        .bind(memberId, context.tenantId, account.id, email, displayName, role, context.tenantId, now, now).run();
      return Response.json({ saved: true, accountCreated }, { status: 201 });
    }
    const invitation = await createTenantInvitation({ context, email, role, origin: new URL(request.url).origin });
    return Response.json({ saved: true, invitation }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const id = new URL(request.url).searchParams.get("id"); if (!id) return Response.json({ error: "缺少成员 ID。" }, { status: 400 });
    const member = await getRuntime().DB.prepare("SELECT email, role FROM tenant_members WHERE tenant_id = ? AND id = ?").bind(context.tenantId, id).first<{ email: string; role: string }>();
    if (!member) return Response.json({ error: "成员不存在。" }, { status: 404 });
    if (member.role === "owner" || member.email === context.email) return Response.json({ error: "不能移除工作区所有者或当前用户。" }, { status: 400 });
    await getRuntime().DB.prepare("UPDATE tenant_members SET status = 'removed', updated_at = ? WHERE tenant_id = ? AND id = ?").bind(new Date().toISOString(), context.tenantId, id).run();
    return Response.json({ removed: true });
  } catch (error) { return routeError(error); }
}
