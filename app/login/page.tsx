import { redirect } from "next/navigation";
import { accountAccess } from "../../lib/app-auth";
import { optionalAccount } from "../../lib/page-auth";
import LoginClient from "./login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const account = await optionalAccount();
  if (account) { const access = await accountAccess(account); if (access.destination !== "/login") redirect(access.destination); }
  return <LoginClient portal="workspace" loggedOut={query.logged_out === "1"} errorCode={typeof query.error === "string" ? query.error : ""}/>;
}
