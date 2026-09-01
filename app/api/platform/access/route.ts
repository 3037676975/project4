import { ensurePlatformAdmin } from "../../../../lib/platform-admin";
import { readIdentity } from "../../../../lib/tenant";

export async function GET(request: Request) {
  const identity = await readIdentity(request);
  if (!identity) return Response.json({ allowed: false }, { status: 401 });
  const admin = await ensurePlatformAdmin(identity.email, identity.displayName, identity.accountId);
  return Response.json({ allowed: admin?.role === "super_admin", internalAdmin: Boolean(admin), role: admin?.role || null });
}
