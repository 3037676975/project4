import { getRuntime } from "../../../lib/runtime";
import { platformRouteError, requirePlatformAdmin, writePlatformAudit } from "../../../lib/platform-admin";

function permissions(role: string) {
  return {
    tenants: role === "super_admin" || role === "operator" || role === "risk",
    refunds: role === "super_admin" || role === "finance",
    tickets: role === "super_admin" || role === "operator" || role === "support",
    risk: role === "super_admin" || role === "risk",
  };
}

export async function GET(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request); const allowed = permissions(admin.role); const { DB } = getRuntime(); const now = new Date().toISOString();
    const [summary, tenants, refunds, tickets, alerts] = await Promise.all([
      DB.prepare(`SELECT
        (SELECT COUNT(*) FROM tenants WHERE onboarding_completed = 0 OR status != 'active') AS tenant_tasks,
        (SELECT COUNT(*) FROM refund_requests WHERE status IN ('requested','approved','processing')) AS refund_tasks,
        (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','processing')) AS ticket_tasks,
        (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','processing') AND sla_due_at IS NOT NULL AND sla_due_at < ?) +
        (SELECT COUNT(*) FROM notification_outbox WHERE status = 'failed') AS risk_tasks`).bind(now).first<Record<string, number>>(),
      allowed.tenants ? DB.prepare(`SELECT id, name, company_name, billing_email, status, onboarding_completed, created_at,
        (SELECT COUNT(*) FROM knowledge_documents kd WHERE kd.tenant_id = tenants.id) AS documents
        FROM tenants WHERE onboarding_completed = 0 OR status != 'active' ORDER BY created_at DESC LIMIT 80`).all() : Promise.resolve({ results: [] }),
      allowed.refunds ? DB.prepare(`SELECT r.id, r.amount_cents, r.reason, r.status, r.created_at, o.order_no, o.provider,
        t.id AS tenant_id, COALESCE(NULLIF(t.company_name,''), t.name) AS tenant_name
        FROM refund_requests r JOIN billing_orders o ON o.id = r.order_id JOIN tenants t ON t.id = r.tenant_id
        WHERE r.status IN ('requested','approved','processing') ORDER BY r.created_at LIMIT 80`).all() : Promise.resolve({ results: [] }),
      allowed.tickets ? DB.prepare(`SELECT st.id, st.subject, st.priority, st.status, st.contact, st.sla_due_at, st.created_at,
        t.id AS tenant_id, COALESCE(NULLIF(t.company_name,''), t.name) AS tenant_name
        FROM support_tickets st JOIN tenants t ON t.id = st.tenant_id WHERE st.status IN ('open','processing')
        ORDER BY CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, st.created_at LIMIT 100`).all() : Promise.resolve({ results: [] }),
      allowed.risk ? DB.prepare(`SELECT id, tenant_id, channel, event_type, entity_type, entity_id, attempts, last_error, created_at
        FROM notification_outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 80`).all() : Promise.resolve({ results: [] }),
    ]);
    return Response.json({ currentAdmin: admin, permissions: allowed, summary: {
      tenantTasks: summary?.tenant_tasks || 0, refundTasks: summary?.refund_tasks || 0,
      ticketTasks: summary?.ticket_tasks || 0, riskTasks: summary?.risk_tasks || 0,
    }, tenants: tenants.results, refunds: refunds.results, tickets: tickets.results, alerts: alerts.results });
  } catch (error) { return platformRouteError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const action = String(body.action || ""); const { DB } = getRuntime(); const now = new Date().toISOString();
    if (action === "tenant_status") {
      const admin = await requirePlatformAdmin(request, ["super_admin", "operator", "risk"]); const tenantId = String(body.tenantId || "");
      const status = body.status === "suspended" ? "suspended" : "active";
      const target = await DB.prepare("SELECT id, name, status FROM tenants WHERE id = ? LIMIT 1").bind(tenantId).first<{ id: string; name: string; status: string }>();
      if (!target) return Response.json({ error: "企业不存在。" }, { status: 404 });
      await DB.prepare("UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, tenantId).run();
      await writePlatformAudit(admin, "admin.tenant.status", "tenant", tenantId, { from: target.status, to: status, name: target.name });
      return Response.json({ saved: true });
    }
    if (action === "refund_review") {
      const admin = await requirePlatformAdmin(request, ["super_admin", "finance"]); const id = String(body.id || "");
      const status = body.decision === "reject" ? "rejected" : "approved";
      const target = await DB.prepare("SELECT id, status, tenant_id, amount_cents FROM refund_requests WHERE id = ? LIMIT 1").bind(id).first<{ id: string; status: string; tenant_id: string; amount_cents: number }>();
      if (!target || target.status !== "requested") return Response.json({ error: "退款申请不存在或已处理。" }, { status: 409 });
      await DB.prepare("UPDATE refund_requests SET status = ?, reviewed_by_member_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'requested'")
        .bind(status, admin.id, now, now, id).run();
      await writePlatformAudit(admin, `admin.refund.${status}`, "refund", id, { tenantId: target.tenant_id, amountCents: target.amount_cents });
      return Response.json({ saved: true });
    }
    if (action === "ticket_status") {
      const admin = await requirePlatformAdmin(request, ["super_admin", "operator", "support"]); const id = String(body.id || "");
      const status = body.status === "resolved" ? "resolved" : "processing";
      const target = await DB.prepare("SELECT id, tenant_id, status FROM support_tickets WHERE id = ? LIMIT 1").bind(id).first<{ id: string; tenant_id: string; status: string }>();
      if (!target) return Response.json({ error: "工单不存在。" }, { status: 404 });
      await DB.batch([
        DB.prepare("UPDATE support_tickets SET status = ?, first_response_at = COALESCE(first_response_at, ?), resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END, updated_at = ? WHERE id = ?")
          .bind(status, now, status, now, now, id),
        DB.prepare("INSERT INTO ticket_events (id, tenant_id, ticket_id, actor_type, actor_id, event_type, detail_json, created_at) VALUES (?, ?, ?, 'platform_admin', ?, ?, ?, ?)")
          .bind(`tevt_${crypto.randomUUID().replaceAll("-", "")}`, target.tenant_id, id, admin.id, `status_${status}`, JSON.stringify({ from: target.status, to: status }), now),
      ]);
      await writePlatformAudit(admin, "admin.ticket.status", "ticket", id, { from: target.status, to: status });
      return Response.json({ saved: true });
    }
    return Response.json({ error: "不支持的运营操作。" }, { status: 400 });
  } catch (error) { return platformRouteError(error); }
}
