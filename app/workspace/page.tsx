import { redirect } from "next/navigation";
import Dashboard from "../dashboard";
import { accountAccess } from "../../lib/app-auth";
import { requireAccount } from "../../lib/page-auth";
import { getRuntime } from "../../lib/runtime";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const account = await requireAccount("/workspace"); const access = await accountAccess(account);
  let initialTenantId: string | undefined;
  if (!access.tenantCount && access.platformRole === "super_admin") {
    const tenant = await getRuntime().DB.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at LIMIT 1").first<{ id: string }>();
    if (!tenant?.id) redirect("/platform?error=no_active_tenant");
    initialTenantId = tenant.id;
  } else if (!access.tenantCount) {
    redirect(access.platformRole ? "/admin" : "/login?error=no_workspace");
  }
  return <Dashboard user={{ displayName: account.displayName, email: account.email }} isPlatformAdmin={access.platformRole === "super_admin"} initialTenantId={initialTenantId} logoutHref="/logout" />;
}
