import { loadHomepageWidgetConfig } from "../../../../lib/platform-settings";

export async function GET() {
  const config = await loadHomepageWidgetConfig();
  return Response.json(config, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}
