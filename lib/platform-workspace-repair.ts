import type { AccountSession } from "./app-auth";
import { getRuntime } from "./runtime";

type WorkspaceRow = {
  tenant_id: string;
  tenant_status: string;
  member_id: string;
  member_status: string;
  member_role: string;
  member_account_id: string | null;
};

/**
 * The platform super administrator also owns a normal enterprise workspace for
 * end-to-end testing. If that workspace (or its owner membership) was suspended
 * from the tenant-management screen, /workspace previously reused the disabled
 * tenant id and every enterprise API returned the misleading "member disabled"
 * message. Restore only the account's own billing/owner workspace; never revive
 * an arbitrary customer tenant merely because the platform admin can see it.
 */
export async function repairPlatformWorkspace(account: AccountSession): Promise<string | null> {
  const { DB } = getRuntime();
  const normalizedEmail = account.email.trim().toLowerCase();
  const row = await DB.prepare(`
    SELECT t.id AS tenant_id, t.status AS tenant_status,
      tm.id AS member_id, tm.status AS member_status, tm.role AS member_role,
      tm.account_id AS member_account_id
    FROM tenant_members tm
    JOIN tenants t ON t.id = tm.tenant_id
    WHERE (tm.account_id = ? OR LOWER(tm.email) = ?)
      AND (
        LOWER(COALESCE(t.billing_email, '')) = ?
        OR (tm.role = 'owner' AND t.slug LIKE 'workspace-%')
      )
    ORDER BY
      CASE WHEN LOWER(COALESCE(t.billing_email, '')) = ? THEN 0 ELSE 1 END,
      CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END,
      CASE WHEN t.status = 'active' AND tm.status = 'active' THEN 0 ELSE 1 END,
      t.created_at ASC
    LIMIT 1
  `).bind(account.id, normalizedEmail, normalizedEmail, normalizedEmail).first<WorkspaceRow>();

  if (!row) return null;

  const needsRepair = row.tenant_status !== "active"
    || row.member_status !== "active"
    || row.member_role !== "owner"
    || row.member_account_id !== account.id;

  if (needsRepair) {
    const now = new Date().toISOString();
    await DB.batch([
      DB.prepare("UPDATE tenants SET status = 'active', updated_at = ? WHERE id = ?")
        .bind(now, row.tenant_id),
      DB.prepare(`UPDATE tenant_members
        SET account_id = ?, email = ?, display_name = ?, role = 'owner', status = 'active', updated_at = ?
        WHERE id = ?`)
        .bind(account.id, normalizedEmail, account.displayName, now, row.member_id),
    ]);
  }

  return row.tenant_id;
}
