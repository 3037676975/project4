import { PublicApiError } from "../../../../lib/api-keys";
import { flushNotificationOutbox, queueNotifications } from "../../../../lib/notifications";
import { cleanupTenantPrivacy } from "../../../../lib/retention";
import { getRuntime } from "../../../../lib/runtime";
import { constantTimeEqual } from "../../../../lib/security";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";

async function authorizedTenantIds(request: Request) {
  const runtime = getRuntime(); const authorization = request.headers.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) {
    const supplied = authorization.slice(7); const configured = runtime.OPERATIONS_SWEEP_SECRET || "";
    if (!configured || !constantTimeEqual(configured, supplied)) throw new PublicApiError(401, "运营巡检密钥无效。");
    const result = await runtime.DB.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY id LIMIT 100").all();
    return (result.results as Array<{ id: string }>).map((row) => row.id);
  }
  const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); return [context.tenantId];
}

async function sweepTenant(tenantId: string) {
  const { DB } = getRuntime(); const now = new Date().toISOString();
  const expiredOrders = await DB.prepare("UPDATE billing_orders SET status = 'expired', updated_at = ? WHERE tenant_id = ? AND status = 'pending' AND expires_at < ?").bind(now, tenantId, now).run();
  const expiredSubscriptions = await DB.prepare(`UPDATE subscriptions SET plan_id = 'plan_free', source = 'expiration_downgrade', expires_at = NULL, auto_renew = 0, updated_at = ?
    WHERE tenant_id = ? AND status = 'active' AND expires_at IS NOT NULL AND expires_at < ? AND plan_id <> 'plan_free'`).bind(now, tenantId, now).run();
  const overdue = await DB.prepare(`SELECT t.id, t.subject, t.assignee_member_id, t.sla_due_at FROM support_tickets t
    WHERE t.tenant_id = ? AND t.status IN ('open','processing') AND t.sla_due_at IS NOT NULL AND t.sla_due_at < ?
    AND NOT EXISTS (SELECT 1 FROM ticket_events e WHERE e.tenant_id = t.tenant_id AND e.ticket_id = t.id AND e.event_type = 'sla_breached')`).bind(tenantId, now).all();
  for (const ticket of overdue.results as Array<Record<string, unknown>>) {
    await DB.prepare(`INSERT INTO ticket_events (id, tenant_id, ticket_id, actor_type, event_type, detail_json, created_at)
      VALUES (?, ?, ?, 'system', 'sla_breached', ?, ?)`)
      .bind(`te_${crypto.randomUUID().replaceAll("-", "")}`, tenantId, ticket.id, JSON.stringify({ slaDueAt: ticket.sla_due_at, assigneeMemberId: ticket.assignee_member_id }), now).run();
    await queueNotifications({ tenantId, eventType: "ticket.sla_breached", entityType: "ticket", entityId: String(ticket.id), payload: { title: `工单 SLA 已超时：${ticket.subject}`, slaDueAt: ticket.sla_due_at, assigneeMemberId: ticket.assignee_member_id } });
  }
  const [delivery, retention] = await Promise.all([flushNotificationOutbox(tenantId, 25), cleanupTenantPrivacy(tenantId)]);
  return { expiredOrders: Number(expiredOrders.meta.changes || 0), expiredSubscriptions: Number(expiredSubscriptions.meta.changes || 0), slaBreaches: overdue.results.length, notifications: delivery, retention };
}

export async function POST(request: Request) {
  try {
    const tenantIds = await authorizedTenantIds(request); const results = [];
    for (const tenantId of tenantIds) results.push({ tenantId, ...(await sweepTenant(tenantId)) });
    return Response.json({ swept: true, tenantCount: tenantIds.length,
      expiredOrders: results.reduce((sum, item) => sum + item.expiredOrders, 0),
      expiredSubscriptions: results.reduce((sum, item) => sum + item.expiredSubscriptions, 0),
      slaBreaches: results.reduce((sum, item) => sum + item.slaBreaches, 0), results });
  } catch (error) { return routeError(error); }
}
