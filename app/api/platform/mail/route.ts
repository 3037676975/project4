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

async function fullSettings() {
  const [mail, homepageWidget, supportEmailAllowed] = await Promise.all([
    publicMailSettings(), loadHomepageWidgetConfig(), supportEmailNotificationsAllowed(),
  ]);
  return { ...mail, homepageWidget, supportEmailAllowed };
}

export async function GET(request: Request) {
  try { await requirePlatformAdmin(request, ["super_admin"]); return Response.json(await fullSettings()); }
  catch (error) { return platformRouteError(error); }
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
      await Promise.all([
        writePlatformSetting(HOMEPAGE_WIDGET_CONFIG_KEY, JSON.stringify(homepageWidget), admin.email),
        writePlatformSetting(SUPPORT_EMAIL_NOTIFICATIONS_KEY, supportEmailAllowed ? "1" : "0", admin.email),
      ]);
      await writePlatformAudit(admin, "support.global_settings.updated", "platform_settings", HOMEPAGE_WIDGET_CONFIG_KEY, {
        widgetEnabled: homepageWidget.enabled, autoOpen: homepageWidget.autoOpen, supportEmailAllowed,
      });
      return Response.json(await fullSettings());
    }

    const saved = await saveMailSettings(body, admin.id);
    await writePlatformAudit(admin, "mail.config.updated", "platform_mail", "primary", {
      host: saved.host, port: saved.port, enabled: saved.enabled, useSsl: saved.useSsl, useStarttls: saved.useStarttls,
      relayReady: saved.relayReady, deliveryReady: saved.deliveryReady, deliveryMode: saved.deliveryMode,
      codeExpiryMinutes: saved.codeExpiryMinutes, resendSeconds: saved.resendSeconds,
    });
    return Response.json({ ...saved, homepageWidget: await loadHomepageWidgetConfig(), supportEmailAllowed: await supportEmailNotificationsAllowed() });
  } catch (error) { return platformRouteError(error); }
}
