import { redirect } from "next/navigation";
import Dashboard from "../dashboard";
import { accountAccess } from "../../lib/app-auth";
import { requireAccount } from "../../lib/page-auth";
import { createTenantWorkspace } from "../../lib/tenant";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const account = await requireAccount("/workspace"); const access = await accountAccess(account);
  let initialTenantId: string | undefined;
  if (!access.tenantCount && access.platformRole === "super_admin") {
    initialTenantId = await createTenantWorkspace({ account, companyName: "KnowFlow 官方测试企业" });
  } else if (!access.tenantCount) {
    redirect(access.platformRole ? "/admin" : "/login?error=no_workspace");
  }
  return <Dashboard user={{ displayName: account.displayName, email: account.email }} isPlatformAdmin={access.platformRole === "super_admin"} initialTenantId={initialTenantId} logoutHref="/logout" />;
}
