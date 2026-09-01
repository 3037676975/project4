import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import LocalLoginClient from "./local-login-client";

export const dynamic = "force-dynamic";

export default async function LocalLoginPage() {
  const runtime = env as unknown as { APP_ENV?: string; LOCAL_AUTH_EMAIL?: string };
  if (runtime.APP_ENV !== "local") redirect("/");
  if (await getChatGPTUser()) redirect("/");
  return <LocalLoginClient defaultEmail={runtime.LOCAL_AUTH_EMAIL || "admin@local.test"} />;
}
