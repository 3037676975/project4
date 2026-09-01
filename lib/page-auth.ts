import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionAccount } from "./app-auth";

export async function requireAccount(returnTo: string, allowPasswordChange = false) {
  const account = await getSessionAccount(await headers());
  if (!account) redirect(`/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
  if (account.mustChangePassword && !allowPasswordChange) redirect("/account?change=required");
  return account;
}

export async function optionalAccount() {
  return getSessionAccount(await headers());
}

function safeReturnTo(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try { const url = new URL(value, "https://app.local"); return url.origin === "https://app.local" ? `${url.pathname}${url.search}` : "/"; }
  catch { return "/"; }
}
