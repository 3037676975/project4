import { expiredLocalSessionCookie } from "../../lib/local-auth";

export async function GET(request: Request) {
  return new Response(null, { status: 302, headers: { Location: new URL("/local-login", request.url).toString(), "Set-Cookie": expiredLocalSessionCookie(), "Cache-Control": "no-store" } });
}
