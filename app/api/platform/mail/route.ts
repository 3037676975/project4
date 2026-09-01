import { assertSameOrigin } from "../../../../lib/app-auth";
import { publicMailSettings, saveMailSettings, sendMail } from "../../../../lib/mail";
import { platformRouteError, requirePlatformAdmin, writePlatformAudit } from "../../../../lib/platform-admin";

export async function GET(request: Request) {
  try { await requirePlatformAdmin(request, ["super_admin"]); return Response.json(await publicMailSettings()); }
  catch (error) { return platformRouteError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const admin = await requirePlatformAdmin(request, ["super_admin"]);
    const body = await request.json() as Record<string, unknown>; const action = body.action === "test" ? "test" : "save";
    if (action === "test") {
      const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Response.json({ error: "请输入有效的测试收件邮箱。" }, { status: 400 });
      await sendMail({ to, subject: "【KnowFlow】SMTP 测试成功", text: "KnowFlow 邮件服务已连接成功。邮箱验证码注册和登录可以开始使用。",
        html: "<div style=\"font-family:Arial,'Microsoft YaHei',sans-serif;padding:28px\"><h2>KnowFlow 邮件服务已连接</h2><p>SMTP 参数、授权码和邮件发送链路均已通过测试。</p></div>" });
      await writePlatformAudit(admin, "mail.test.sent", "platform_mail", "primary", { recipientDomain: to.split("@")[1] });
      return Response.json({ sent: true, message: "测试邮件已发送，请检查收件箱。" });
    }
    const saved = await saveMailSettings(body, admin.id);
    await writePlatformAudit(admin, "mail.config.updated", "platform_mail", "primary", {
      host: saved.host, port: saved.port, enabled: saved.enabled, useSsl: saved.useSsl, useStarttls: saved.useStarttls,
      relayReady: saved.relayReady, deliveryReady: saved.deliveryReady, deliveryMode: saved.deliveryMode,
      codeExpiryMinutes: saved.codeExpiryMinutes, resendSeconds: saved.resendSeconds,
    });
    return Response.json(saved);
  } catch (error) { return platformRouteError(error); }
}
