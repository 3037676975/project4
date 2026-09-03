import { NextResponse } from "next/server";
import {
  getWidgetSettings,
  updateWidgetSettings,
} from "@/features/customer-service/widget/WidgetSettingsStore";

/**
 * Widget settings API.
 *
 * Phase 2.10:
 * API no longer owns runtime configuration.
 * The storage adapter can later be replaced by database persistence.
 */

export async function GET() {
  return NextResponse.json({
    success: true,
    data: getWidgetSettings(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  return NextResponse.json({
    success: true,
    data: updateWidgetSettings(body),
    message: "Widget settings updated",
  });
}
