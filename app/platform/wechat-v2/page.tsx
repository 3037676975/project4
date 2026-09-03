import { redirect } from "next/navigation";
import { accountAccess } from "../../../lib/app-auth";
import { requireAccount } from "../../../lib/page-auth";
import WechatV2Client from "./wechat-v2-client";

export const dynamic = "force-dynamic";

export default async function WechatV2Page() {
  const account = await requireAccount("/platform/wechat-v2");
  const access = await accountAccess(account);
  if (access.platformRole !== "super_admin") redirect(access.platformRole ? "/admin" : access.tenantCount ? "/workspace" : "/login?error=forbidden");
  return <WechatV2Client />;
}
