import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";
import { normalizeAllowedDomain } from "../../../lib/public-widget";
import { flushNotificationOutbox, queueNotifications } from "../../../lib/notifications";
import { getIndustryTemplate, listIndustryTemplates } from "../../../lib/industry-templates";

function parseQuestions(value: unknown, max = 6) {
  try { const list = JSON.parse(String(value || "[]")); return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string").slice(0, max) : []; }
  catch { return []; }
}

function assistantJson(row: Record<string, unknown>) {
  return {
    id: row.id, publicId: row.public_id, publicEnabled: Boolean(row.public_enabled), brandName: row.brand_name,
    welcomeMessage: row.welcome_message, themeColor: row.theme_color, leadCaptureEnabled: Boolean(row.lead_capture_enabled),
    handoffEnabled: Boolean(row.handoff_enabled), handoffLabel: row.handoff_label, industryTemplate: row.industry_template,
    suggestedQuestions: parseQuestions(row.suggested_questions_json), allowedDomains: parseQuestions(row.allowed_domains_json, 20),
    privacyNotice: row.privacy_notice, privacyPolicyUrl: row.privacy_policy_url, privacyVersion: row.privacy_version,
    retentionDays: Number(row.retention_days || 180), version: row.version,
  };
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime();
    let assistant = await DB.prepare(`SELECT id, public_id, public_enabled, brand_name, welcome_message, theme_color,
      lead_capture_enabled, handoff_enabled, handoff_label, industry_template, suggested_questions_json, allowed_domains_json,
      privacy_notice, privacy_policy_url, privacy_version, retention_days, version
      FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1`).bind(context.tenantId).first<Record<string, unknown>>();
    if (!assistant) return Response.json({ error: "助手尚未初始化。" }, { status: 404 });
    if (!assistant.public_id) {
      const publicId = `pub_${crypto.randomUUID().replaceAll("-", "")}`;
      await DB.prepare("UPDATE assistants SET public_id = ? WHERE id = ? AND tenant_id = ?").bind(publicId, assistant.id, context.tenantId).run();
      assistant = { ...assistant, public_id: publicId };
    }
    const since = new Date(Date.now() - 30 * 86400000).toISOString(); const month = new Date().toISOString().slice(0, 7);
    const [summary, leads, tickets, unresolved, plan, monthly, financial] = await Promise.all([
      DB.prepare(`SELECT COUNT(*) AS conversations, COALESCE(SUM(CASE WHEN verified_resolved = 1 THEN 1 ELSE 0 END), 0) AS resolved,
        COALESCE(SUM(CASE WHEN ai_resolved = 1 THEN 1 ELSE 0 END), 0) AS grounded,
        COALESCE(SUM(CASE WHEN status = 'unresolved' THEN 1 ELSE 0 END), 0) AS unresolved
        FROM customer_conversations WHERE tenant_id = ? AND started_at >= ?`).bind(context.tenantId, since).first<Record<string, number>>(),
      DB.prepare(`SELECT id, name, company, contact, need, status, assignee_member_id, estimated_value_cents, notes, created_at, updated_at
        FROM customer_leads WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 40`).bind(context.tenantId).all(),
      DB.prepare(`SELECT id, subject, description, contact, priority, status, assignee_member_id, sla_due_at, first_response_at, resolved_at, created_at, updated_at
        FROM support_tickets WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 40`).bind(context.tenantId).all(),
      DB.prepare(`SELECT id, first_question, last_question, message_count, started_at, last_message_at
        FROM customer_conversations WHERE tenant_id = ? AND status = 'unresolved' ORDER BY last_message_at DESC LIMIT 20`).bind(context.tenantId).all(),
      DB.prepare(`SELECT p.code, p.name, p.widget_conversation_quota, p.lead_quota, p.features_json
        FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? AND s.status = 'active'
        ORDER BY s.created_at DESC LIMIT 1`).bind(context.tenantId).first<Record<string, unknown>>(),
      DB.prepare(`SELECT
        (SELECT COUNT(*) FROM customer_conversations WHERE tenant_id = ? AND started_at >= ?) AS conversations,
        (SELECT COUNT(*) FROM customer_leads WHERE tenant_id = ? AND created_at >= ?) AS leads,
        (SELECT COALESCE(SUM(estimated_value_cents), 0) FROM customer_leads WHERE tenant_id = ? AND status IN ('qualified','won')) AS pipeline_cents,
        (SELECT COALESCE(SUM(estimated_value_cents), 0) FROM customer_leads WHERE tenant_id = ? AND status = 'won') AS won_cents,
        (SELECT COUNT(*) FROM support_tickets WHERE tenant_id = ? AND status IN ('open','processing')) AS open_tickets
      `).bind(context.tenantId, `${month}-01T00:00:00.000Z`, context.tenantId, `${month}-01T00:00:00.000Z`, context.tenantId, context.tenantId, context.tenantId).first<Record<string, number>>(),
      DB.prepare(`SELECT
        (SELECT COALESCE(SUM(amount_cents), 0) FROM billing_orders WHERE tenant_id = ? AND status = 'fulfilled' AND fulfilled_at >= ?) AS revenue_cents,
        (SELECT COALESCE(SUM(cost_micros), 0) FROM usage_records WHERE tenant_id = ? AND created_at >= ?) AS cost_micros`
      ).bind(context.tenantId, `${month}-01T00:00:00.000Z`, context.tenantId, `${month}-01T00:00:00.000Z`).first<Record<string, number>>(),
    ]);
    const conversationCount = Number(summary?.conversations || 0); const resolvedCount = Number(summary?.resolved || 0);
    return Response.json({
      assistant: assistantJson(assistant),
      templates: listIndustryTemplates().map((item) => ({ code: item.code, name: item.name })),
      summary: { conversations: conversationCount, resolved: resolvedCount, grounded: Number(summary?.grounded || 0), unresolved: Number(summary?.unresolved || 0), resolutionRate: conversationCount ? Math.round(resolvedCount / conversationCount * 100) : 0, leads: Number(monthly?.leads || 0), openTickets: Number(monthly?.open_tickets || 0), pipelineCents: Number(monthly?.pipeline_cents || 0), wonCents: Number(monthly?.won_cents || 0),
        revenueCents: Number(financial?.revenue_cents || 0), costCents: Math.round(Number(financial?.cost_micros || 0) / 10000), grossProfitCents: Number(financial?.revenue_cents || 0) - Math.round(Number(financial?.cost_micros || 0) / 10000) },
      plan: { code: plan?.code || "free", name: plan?.name || "体验版", widgetConversationQuota: Number(plan?.widget_conversation_quota || 50), leadQuota: Number(plan?.lead_quota || 10), features: JSON.parse(String(plan?.features_json || "[]")) },
      monthly: { month, conversations: Number(monthly?.conversations || 0), leads: Number(monthly?.leads || 0) },
      leads: (leads.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, name: row.name, company: row.company, contact: row.contact, need: row.need, status: row.status, assigneeMemberId: row.assignee_member_id, estimatedValueCents: row.estimated_value_cents, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at })),
      tickets: (tickets.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, subject: row.subject, description: row.description, contact: row.contact, priority: row.priority, status: row.status, assigneeMemberId: row.assignee_member_id, slaDueAt: row.sla_due_at, firstResponseAt: row.first_response_at, resolvedAt: row.resolved_at, createdAt: row.created_at, updatedAt: row.updated_at })),
      unresolved: (unresolved.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, firstQuestion: row.first_question, lastQuestion: row.last_question, messageCount: row.message_count, startedAt: row.started_at, lastMessageAt: row.last_message_at })),
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); const body = await request.json() as Record<string, unknown>; const { DB } = getRuntime();
    const assistant = await DB.prepare("SELECT id FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").bind(context.tenantId).first<{ id: string }>();
    if (!assistant) return Response.json({ error: "助手尚未初始化。" }, { status: 404 });
    const action = String(body.action || "saveWidget"); const now = new Date().toISOString();
    if (action === "publishNow") {
      await DB.prepare("UPDATE assistants SET public_enabled = 1, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, assistant.id, context.tenantId).run();
      return Response.json({ saved: true, message: "官网客服已一键发布。" });
    }
    if (action === "applyTemplate") {
      const code = String(body.template || "manufacturing_after_sales"); const template = getIndustryTemplate(code);
      if (!template) return Response.json({ error: "行业模板不存在。" }, { status: 404 });
      await DB.prepare(`UPDATE assistants SET industry_template = ?, brand_name = ?, welcome_message = ?, suggested_questions_json = ?,
        system_prompt = ?, lead_capture_enabled = 1, handoff_enabled = 1, version = version + 1, updated_at = ?
        WHERE id = ? AND tenant_id = ?`).bind(code, template.brandName, template.welcomeMessage, JSON.stringify(template.questions), template.systemPrompt, now, assistant.id, context.tenantId).run();
      return Response.json({ saved: true, message: `已应用“${template.name}”模板，助手提示词同步升级。` });
    }
    const brandName = typeof body.brandName === "string" ? body.brandName.trim().slice(0, 80) : "";
    const welcomeMessage = typeof body.welcomeMessage === "string" ? body.welcomeMessage.trim().slice(0, 500) : "";
    const themeColor = typeof body.themeColor === "string" && /^#[0-9a-f]{6}$/i.test(body.themeColor) ? body.themeColor : "";
    const handoffLabel = typeof body.handoffLabel === "string" ? body.handoffLabel.trim().slice(0, 40) : "";
    const suggestedQuestions = Array.isArray(body.suggestedQuestions) ? body.suggestedQuestions.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 100)).filter(Boolean).slice(0, 6) : [];
    const rawDomains = Array.isArray(body.allowedDomains) ? body.allowedDomains.filter((item): item is string => typeof item === "string") : [];
    const allowedDomains = [...new Set(rawDomains.map(normalizeAllowedDomain).filter((item): item is string => Boolean(item)))].slice(0, 20);
    if (rawDomains.some((item) => item.trim()) && !allowedDomains.length) return Response.json({ error: "域名白名单格式无效，请填写 example.com 或 *.example.com。" }, { status: 400 });
    const privacyNotice = typeof body.privacyNotice === "string" ? body.privacyNotice.trim().slice(0, 500) : "";
    const privacyPolicyUrl = typeof body.privacyPolicyUrl === "string" ? body.privacyPolicyUrl.trim().slice(0, 500) : "";
    if (privacyPolicyUrl) { try { const url = new URL(privacyPolicyUrl); if (url.protocol !== "https:") throw new Error(); } catch { return Response.json({ error: "隐私政策地址必须是 HTTPS URL。" }, { status: 400 }); } }
    const retentionDays = Math.max(30, Math.min(1095, Math.round(Number(body.retentionDays || 180))));
    if (!brandName || !welcomeMessage || !themeColor || !handoffLabel) return Response.json({ error: "品牌名称、欢迎语、主题颜色和人工按钮名称不能为空。" }, { status: 400 });
    await DB.prepare(`UPDATE assistants SET public_enabled = ?, brand_name = ?, welcome_message = ?, theme_color = ?,
      lead_capture_enabled = ?, handoff_enabled = ?, handoff_label = ?, suggested_questions_json = ?, allowed_domains_json = ?,
      privacy_notice = ?, privacy_policy_url = ?, retention_days = ?, privacy_version = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?`).bind(body.publicEnabled ? 1 : 0, brandName, welcomeMessage, themeColor, body.leadCaptureEnabled ? 1 : 0, body.handoffEnabled ? 1 : 0, handoffLabel, JSON.stringify(suggestedQuestions), JSON.stringify(allowedDomains), privacyNotice || "为便于回复您的咨询，我们仅在您同意后收集必要的联系方式和问题描述。", privacyPolicyUrl, retentionDays, new Date().toISOString().slice(0, 10), now, assistant.id, context.tenantId).run();
    return Response.json({ saved: true, message: body.publicEnabled ? "官网智能客服已发布。" : "官网智能客服已关闭。" });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); const body = await request.json() as Record<string, unknown>; const { DB } = getRuntime(); const now = new Date().toISOString();
    const entity = String(body.entity || ""); const id = typeof body.id === "string" ? body.id : "";
    if (entity === "lead") {
      const status = String(body.status || ""); if (!['new','contacted','qualified','won','lost'].includes(status)) return Response.json({ error: "线索状态无效。" }, { status: 400 });
      const estimatedValueCents = Math.max(0, Math.min(100000000000, Math.round(Number(body.estimatedValueYuan || 0) * 100)));
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
      const assigneeMemberId = typeof body.assigneeMemberId === "string" && body.assigneeMemberId ? body.assigneeMemberId : null;
      if (assigneeMemberId) { const valid = await DB.prepare("SELECT id FROM tenant_members WHERE tenant_id = ? AND id = ? AND status = 'active'").bind(context.tenantId, assigneeMemberId).first(); if (!valid) return Response.json({ error: "负责人不是当前企业的有效成员。" }, { status: 400 }); }
      const result = await DB.prepare("UPDATE customer_leads SET status = ?, assignee_member_id = ?, estimated_value_cents = ?, notes = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(status, assigneeMemberId, estimatedValueCents, notes, now, id, context.tenantId).run();
      if (!result.meta.changes) return Response.json({ error: "线索不存在。" }, { status: 404 });
    } else if (entity === "ticket") {
      const status = String(body.status || ""); if (!['open','processing','resolved','closed'].includes(status)) return Response.json({ error: "工单状态无效。" }, { status: 400 });
      const priority = ['low','normal','high','urgent'].includes(String(body.priority)) ? String(body.priority) : 'normal';
      const assigneeMemberId = typeof body.assigneeMemberId === "string" && body.assigneeMemberId ? body.assigneeMemberId : null;
      if (assigneeMemberId) { const valid = await DB.prepare("SELECT id FROM tenant_members WHERE tenant_id = ? AND id = ? AND status = 'active'").bind(context.tenantId, assigneeMemberId).first(); if (!valid) return Response.json({ error: "负责人不是当前企业的有效成员。" }, { status: 400 }); }
      const result = await DB.prepare(`UPDATE support_tickets SET status = ?, priority = ?, assignee_member_id = ?,
        first_response_at = CASE WHEN ? IN ('processing','resolved','closed') THEN COALESCE(first_response_at, ?) ELSE first_response_at END,
        resolved_at = CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at, ?) ELSE NULL END, updated_at = ? WHERE id = ? AND tenant_id = ?`)
        .bind(status, priority, assigneeMemberId, status, now, status, now, now, id, context.tenantId).run();
      if (!result.meta.changes) return Response.json({ error: "工单不存在。" }, { status: 404 });
      await DB.prepare(`INSERT INTO ticket_events (id, tenant_id, ticket_id, actor_type, actor_id, event_type, detail_json, created_at)
        VALUES (?, ?, ?, 'member', ?, 'updated', ?, ?)`)
        .bind(`te_${crypto.randomUUID().replaceAll("-", "")}`, context.tenantId, id, context.memberId, JSON.stringify({ status, priority, assigneeMemberId }), now).run();
      await queueNotifications({ tenantId: context.tenantId, eventType: "ticket.updated", entityType: "ticket", entityId: id, payload: { title: "工单已更新", status, priority, assigneeMemberId } });
      await flushNotificationOutbox(context.tenantId, 5).catch(() => undefined);
    } else return Response.json({ error: "不支持的更新类型。" }, { status: 400 });
    return Response.json({ saved: true });
  } catch (error) { return routeError(error); }
}
