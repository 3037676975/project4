import { requireAccount } from "../../lib/page-auth";
import AccountClient from "./account-client";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const account = await requireAccount("/account", true);
  return <AccountClient account={{ email: account.email, displayName: account.displayName, mustChangePassword: account.mustChangePassword }}/>;
}
