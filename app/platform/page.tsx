import { redirect } from "next/navigation";
import { accountAccess } from "../../lib/app-auth";
import { ensurePlatformAdmin } from "../../lib/platform-admin";
import { requireAccount } from "../../lib/page-auth";
import PlatformDashboard from "./platform-dashboard";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const account = await requireAccount("/platform"); const access = await accountAccess(account);
  if (access.platformRole !== "super_admin") redirect(access.platformRole ? "/admin" : access.tenantCount ? "/workspace" : "/login?error=forbidden");
  const admin = await ensurePlatformAdmin(account.email, account.displayName, account.id);
  if (!admin) redirect("/login?error=forbidden");
  return <PlatformDashboard user={{ displayName: account.displayName, email: account.email }} admin={admin} logoutHref="/logout"/>;
}
