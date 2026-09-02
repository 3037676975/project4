import { paymentState } from "../../../../../lib/billing";
import { listPaymentLabLogs, listPaymentLabOrders, paymentLabProfile } from "../../../../../lib/payment-lab";
import { requirePlatformAdmin, platformRouteError } from "../../../../../lib/platform-admin";
import { getRuntime } from "../../../../../lib/runtime";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request, ["super_admin"]);
    const runtime = getRuntime();
    const baseUrl = runtime.APP_BASE_URL || new URL(request.url).origin;
    const [state, orders, logs] = await Promise.all([
      paymentState(),
      listPaymentLabOrders(100),
      listPaymentLabLogs(150),
    ]);
    return Response.json({
      profile: paymentLabProfile(baseUrl),
      state,
      orders,
      logs,
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return platformRouteError(error); }
}
