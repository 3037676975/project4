import { expiredAppSessionCookie, revokeCurrentSession } from "../../lib/app-auth";

export async function GET(request: Request) {
  await revokeCurrentSession(request.headers);
  return new Response(null, { status: 303, headers: { Location: "/login?logged_out=1", "Set-Cookie": expiredAppSessionCookie() } });
}
