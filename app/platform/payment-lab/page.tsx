import { redirect } from "next/navigation";
import { accountAccess } from "../../../lib/app-auth";
import { requireAccount } from "../../../lib/page-auth";
import PaymentLabClient from "./payment-lab-client";

export const dynamic = "force-dynamic";

export default async function PaymentLabPage() {
  const account = await requireAccount("/platform/payment-lab");
  const access = await accountAccess(account);
  if (access.platformRole !== "super_admin") redirect(access.platformRole ? "/admin" : access.tenantCount ? "/workspace" : "/login?error=forbidden");
  return <PaymentLabClient />;
}
