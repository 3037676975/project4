import { redirect } from "next/navigation";
import { ensurePlatformAdmin } from "../../lib/platform-admin";
import { requireAccount } from "../../lib/page-auth";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const account = await requireAccount("/admin"); const admin = await ensurePlatformAdmin(account.email, account.displayName, account.id);
  if (!admin) redirect("/workspace");
  return <AdminDashboard user={{ displayName: account.displayName, email: account.email }} admin={admin}/>;
}
