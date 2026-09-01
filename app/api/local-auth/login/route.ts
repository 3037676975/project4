import { localSessionCookie, verifyLocalCredentials } from "../../../../lib/local-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyLocalCredentials(email, password)) {
    return Response.json({ error: "管理员邮箱或密码不正确。" }, { status: 401 });
  }
  return Response.json({ authenticated: true }, { headers: { "Set-Cookie": localSessionCookie(), "Cache-Control": "no-store" } });
}
