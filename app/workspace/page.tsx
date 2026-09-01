import { redirect } from "next/navigation";
import Dashboard from "../dashboard";
import { accountAccess } from "../../lib/app-auth";
import { requireAccount } from "../../lib/page-auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const account = await requireAccount("/workspace"); const access = await accountAccess(account);
  if (!access.tenantCount) redirect(access.platformRole === "super_admin" ? "/platform" : access.platformRole ? "/admin" : "/login?error=no_workspace");
  return <Dashboard user={{ displayName: account.displayName, email: account.email }} isPlatformAdmin={access.platformRole === "super_admin"} logoutHref="/logout" />;
}
