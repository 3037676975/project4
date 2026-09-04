import { assertSameOrigin } from "../../../../lib/app-auth";
import { publicMailSettings, saveMailSettings, sendMail } from "../../../../lib/mail";
import { platformRouteError, requirePlatformAdmin, writePlatformAudit } from "../../../../lib/platform-admin";
import {
  HOMEPAGE_WIDGET_CONFIG_KEY,
  SUPPORT_EMAIL_NOTIFICATIONS_KEY,
  loadHomepageWidgetConfig,
  supportEmailNotificationsAllowed,
  writePlatformSetting,
} from "../../../../lib/platform-settings";
import { getRuntime } from "../../../../lib/runtime";

type AdminRef = { accountId: string | null; email: string };
type SupportAssistant = { id: string; tenant_id: string; knowledge_base_id: string; tenant_name: string };

async function resolveSupportAssistant(admin: AdminRef) {
  const accountId = admin.accountId || "";
  return getRuntime().DB.prepare(`SELECT a.id, a.tenant_id, a.knowledge_base_id, t.name AS tenant_name
    FROM tenant_members tm
    JOIN tenants t ON t.id = tm.tenant_id AND t.status = 'active'
    JOIN assistants a ON a.tenant_id = tm.tenant_id AND a.status = 'active'
    WHERE tm.status = 'active'
      AND tm.role IN ('owner','admin')
      AND ((? <> '' AND tm.account_id = ?) OR tm.email = ?)
    ORDER BY CASE tm.role WHEN 'owner' THEN 0 ELSE 1 END, a.created_at ASC
    LIMIT 1`).bind(accountId, accountId, admin.email).first<SupportAssistant>();
}

async function loadSupportKnowledge(admin: AdminRef) {
  const assistant = await resolveSupportAssistant(admin);
  if (!assistant) return { available: false, tenantId: "", tenantName: "", assistantId: "", knowledgeBaseId: "", knowledgeBases: [] as Array<Record<string, unknown>> };
  const result = await getRuntime().DB.prepare(`SELECT kb.id, kb.name, kb.description, kb.is_default, kb.position,
      COUNT(DISTINCT d.id) AS document_count, COUNT(DISTINCT c.id) AS category_count
    FROM knowledge_bases kb
    LEFT JOIN knowledge_documents d ON d.tenant_id = kb.tenant_id AND d.knowledge_base_id = kb.id
    LEFT JOIN knowledge_categories c ON c.tenant_id = kb.tenant_id AND c.knowledge_base_id = kb.id
    WHERE kb.tenant_id = ? AND kb.status = 'active'
    GROUP BY kb.id
    ORDER BY kb.is_default DESC, kb.position ASC, kb.created_at ASC`).bind(assistant.tenant_id).all();
  return {
    available: true,
    tenantId: assistant.tenant_id,
    tenantName: assistant.tenant_name,
    assistantId: assistant.id,
    knowledgeBaseId: assistant.knowledge_base_id,
    knowledgeBases: (result.results as Array<Record<string, unknown>>).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isDefault: Boolean(row.is_default),
      position: Number(row.position || 0),
      documentCount: Number(row.document_count || 0),
      categoryCount: Number(row.category_count || 0),
    })),
  };
}

async function fullSettings(admin: AdminRef) {
  const [mail, homepageWidget, supportEmailAllowed, supportKnowledge] = await Promise.all([
    publicMailSettings(), loadHomepageWidgetConfig(), supportEmailNotificationsAllowed(), loadSupportKnowledge(admin),
  ]);
  return { ...mail, homepageWidget, supportEmailAllowed, supportKnowledge };
}

export async function GET(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request, ["super_admin"]);
    return Response.json(await fullSettings(admin));
  } catch (error) { return platformRouteError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const admin = await requirePlatformAdmin(request, ["super_admin"]);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "save");

    if (action === "test") {
      const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Response.json({ error: "请输入有效的测试收件邮箱。" }, { status: 400 });
      await sendMail({ to, subject: "【KnowFlow】SMTP 测试成功", text: "KnowFlow 邮件服务已连接成功。邮箱验证码注册、登录与客服通知可以开始使用。",
        html: "<div style=\"font-family:Arial,'Microsoft YaHei',sans-serif;padding:28px\"><h2>KnowFlow 邮件服务已连接</h2><p>SMTP 参数、授权码和邮件发送链路均已通过测试。</p></div>" });
      await writePlatformAudit(admin, "mail.test.sent", "platform_mail", "primary", { recipientDomain: to.split("@")[1] });
      return Response.json({ sent: true, message: "测试邮件已发送，请检查收件箱。" });
    }

    if (action === "support_settings") {
      const raw = (body.homepageWidget && typeof body.homepageWidget === "object" ? body.homepageWidget : {}) as Record<string, unknown>;
      const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 40) : "KnowFlow 智能客服";
      const welcomeMessage = typeof raw.welcomeMessage === "string" ? raw.welcomeMessage.trim().slice(0, 500) : "";
      const quickQuestions = Array.isArray(raw.quickQuestions)
        ? raw.quickQuestions.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 40)).filter(Boolean).slice(0, 8)
        : [];
      if (!title || !welcomeMessage) return Response.json({ error: "客服名称和欢迎语不能为空。" }, { status: 400 });
      const homepageWidget = {
        enabled: raw.enabled !== false,
        autoOpen: raw.autoOpen !== false,
        title,
        welcomeMessage,
        quickQuestions: quickQuestions.length ? quickQuestions : ["了解套餐", "预约演示", "RAG 怎么用", "支持私有化吗"],
      };
      const supportEmailAllowed = body.supportEmailAllowed === true;
      const supportRaw = (body.supportKnowledge && typeof body.supportKnowledge === "object" ? body.supportKnowledge : {}) as Record<string, unknown>;
      const knowledgeBaseId = typeof supportRaw.knowledgeBaseId === "string" ? supportRaw.knowledgeBaseId.trim() : "";
      const supportAssistant = await resolveSupportAssistant(admin);
      if (knowledgeBaseId) {
        if (!supportAssistant) return Response.json({ error: "超级管理员尚未绑定可用于官网客服的企业工作区。" }, { status: 409 });
        const kb = await getRuntime().DB.prepare("SELECT id, name FROM knowledge_bases WHERE id = ? AND tenant_id = ? AND status = 'active' LIMIT 1")
          .bind(knowledgeBaseId, supportAssistant.tenant_id).first<{ id: string; name: string }>();
        if (!kb) return Response.json({ error: "选择的全局客服知识库不存在或无权限。" }, { status: 404 });
        await getRuntime().DB.prepare("UPDATE assistants SET knowledge_base_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
          .bind(kb.id, new Date().toISOString(), supportAssistant.id, supportAssistant.tenant_id).run();
      }
      await Promise.all([
        writePlatformSetting(HOMEPAGE_WIDGET_CONFIG_KEY, JSON.stringify(homepageWidget), admin.email),
        writePlatformSetting(SUPPORT_EMAIL_NOTIFICATIONS_KEY, supportEmailAllowed ? "1" : "0", admin.email),
      ]);
      await writePlatformAudit(admin, "support.global_settings.updated", "platform_settings", HOMEPAGE_WIDGET_CONFIG_KEY, {
        widgetEnabled: homepageWidget.enabled, autoOpen: homepageWidget.autoOpen, supportEmailAllowed, knowledgeBaseId: knowledgeBaseId || supportAssistant?.knowledge_base_id || null,
      });
      return Response.json(await fullSettings(admin));
    }

    const saved = await saveMailSettings(body, admin.id);
    await writePlatformAudit(admin, "mail.config.updated", "platform_mail", "primary", {
      host: saved.host, port: saved.port, enabled: saved.enabled, useSsl: saved.useSsl, useStarttls: saved.useStarttls,
      relayReady: saved.relayReady, deliveryReady: saved.deliveryReady, deliveryMode: saved.deliveryMode,
      codeExpiryMinutes: saved.codeExpiryMinutes, resendSeconds: saved.resendSeconds,
    });
    return Response.json(await fullSettings(admin));
  } catch (error) { return platformRouteError(error); }
}
