import { redirect } from "next/navigation";
import Dashboard from "../dashboard";
import { accountAccess } from "../../lib/app-auth";
import { requireAccount } from "../../lib/page-auth";
import { createTenantWorkspace } from "../../lib/tenant";
import { repairPlatformWorkspace } from "../../lib/platform-workspace-repair";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const account = await requireAccount("/workspace");
  let access = await accountAccess(account);
  let initialTenantId: string | undefined;

  if (access.platformRole === "super_admin") {
    // Always resolve the superadmin's own enterprise workspace and pass it to
    // the client. This also overwrites a stale localStorage tenant id left from
    // an earlier enterprise switch.
    initialTenantId = await repairPlatformWorkspace(account) || undefined;
    if (!initialTenantId && !access.tenantCount) {
      initialTenantId = await createTenantWorkspace({ account, companyName: "KnowFlow 官方测试企业" });
    }
    if (initialTenantId && !access.tenantCount) access = await accountAccess(account);
  } else if (!access.tenantCount) {
    redirect(access.platformRole ? "/admin" : "/login?error=no_workspace");
  }

  return <Dashboard user={{ displayName: account.displayName, email: account.email }} isPlatformAdmin={access.platformRole === "super_admin"} initialTenantId={initialTenantId} logoutHref="/logout" />;
}
