import { NextResponse } from "next/server";
import {
  loadTenantWidgetSettings,
  updateTenantWidgetSettings,
} from "@/features/customer-service/widget/WidgetSettingsService";

/**
 * Widget settings API.
 *
 * Phase 2.11:
 * API -> Service -> Repository.
 * Tenant support is introduced through tenantId.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? "default";

  return NextResponse.json({
    success: true,
    tenantId,
    data: loadTenantWidgetSettings(tenantId),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = body.tenantId ?? "default";

  return NextResponse.json({
    success: true,
    tenantId,
    data: updateTenantWidgetSettings(tenantId, body.settings ?? body),
    message: "Widget settings updated",
  });
}
