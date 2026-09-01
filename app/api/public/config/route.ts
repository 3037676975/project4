import { loadPublicWidgetAssistant, publicWidgetError, verifyEmbedToken } from "../../../../lib/public-widget";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const publicId = url.searchParams.get("publicId") || "";
    const assistant = await loadPublicWidgetAssistant(publicId);
    if (!assistant) return Response.json({ error: "该客服入口不存在或尚未启用。" }, { status: 404 });
    await verifyEmbedToken(assistant, url.searchParams.get("embedToken") || "");
    return Response.json({
      publicId: assistant.publicId, brandName: assistant.brandName, welcomeMessage: assistant.welcomeMessage,
      themeColor: assistant.themeColor, leadCaptureEnabled: assistant.leadCaptureEnabled && assistant.features.includes("lead_capture"),
      handoffEnabled: assistant.handoffEnabled && assistant.features.includes("handoff"), handoffLabel: assistant.handoffLabel,
      suggestedQuestions: assistant.suggestedQuestions,
      privacyNotice: assistant.privacyNotice, privacyPolicyUrl: assistant.privacyPolicyUrl,
      privacyVersion: assistant.privacyVersion, retentionDays: assistant.retentionDays,
    }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) { return publicWidgetError(error); }
}
