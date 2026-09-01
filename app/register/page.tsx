import { redirect } from "next/navigation";
import { optionalAccount } from "../../lib/page-auth";
import RegisterClient from "./register-client";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await optionalAccount()) redirect("/");
  const query = await searchParams; const inviteToken = typeof query.invite === "string" ? query.invite : "";
  return <RegisterClient inviteToken={inviteToken}/>;
}
