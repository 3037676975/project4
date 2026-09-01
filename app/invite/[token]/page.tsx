import { redirect } from "next/navigation";
import { optionalAccount } from "../../../lib/page-auth";
import InviteClient from "./invite-client";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const account = await optionalAccount();
  if (!account) redirect(`/register?invite=${encodeURIComponent(token)}`);
  return <InviteClient token={token} email={account.email} />;
}
