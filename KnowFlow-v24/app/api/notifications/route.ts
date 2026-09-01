import { flushNotificationOutbox, listNotificationConfigs, NotificationChannel, saveNotificationConfig } from "../../../lib/notifications";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime();
    const [configs, outbox] = await Promise.all([listNotificationConfigs(context.tenantId), DB.prepare(`SELECT id, channel, event_type, entity_type, entity_id, status, attempts, last_error, created_at, sent_at
      FROM notification_outbox WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 30`).bind(context.tenantId).all()]);
    return Response.json({ configs, outbox: (outbox.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, channel: row.channel, eventType: row.event_type, entityType: row.entity_type, entityId: row.entity_id, status: row.status, attempts: row.attempts, lastError: row.last_error, createdAt: row.created_at, sentAt: row.sent_at })) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); const body = await request.json() as Record<string, unknown>;
    if (body.action === "flush") return Response.json(await flushNotificationOutbox(context.tenantId, 25));
    const channel = String(body.channel || "") as NotificationChannel;
    if (!["wecom", "email", "sms", "webhook"].includes(channel)) return Response.json({ error: "通知渠道无效。" }, { status: 400 });
    const events = Array.isArray(body.events) ? body.events.filter((item): item is string => typeof item === "string").filter((item) => ["ticket.created", "ticket.updated", "ticket.sla_breached", "lead.created", "privacy.requested", "*"].includes(item)).slice(0, 10) : [];
    const saved = await saveNotificationConfig({ tenantId: context.tenantId, channel, endpoint: typeof body.endpoint === "string" ? body.endpoint : "", secret: typeof body.secret === "string" ? body.secret : "", events, enabled: body.enabled === true });
    return Response.json(saved);
  } catch (error) { return routeError(error); }
}
