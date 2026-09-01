import { redirect } from "next/navigation";
import { accountAccess, portalDestination } from "../../../lib/app-auth";
import { optionalAccount } from "../../../lib/page-auth";
import LoginClient from "../../login/login-client";

export const dynamic = "force-dynamic";

export default async function WorkspaceLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams; const account = await optionalAccount();
  if (account) { const access = await accountAccess(account); const destination = portalDestination(access, "workspace") || (access.destination !== "/login" ? access.destination : null); if (destination) redirect(destination); }
  return <LoginClient portal="workspace" loggedOut={query.logged_out === "1"} errorCode={typeof query.error === "string" ? query.error : ""}/>;
}
