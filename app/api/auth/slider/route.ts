import { assertSameOrigin, authRouteError, validLoginPortal } from "../../../../lib/app-auth";
import { createSliderChallenge, validVerificationPurpose, verifySliderChallenge } from "../../../../lib/auth-verification";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as Record<string, unknown>; const action = body.action === "verify" ? "verify" : "create";
    if (action === "create") return Response.json(await createSliderChallenge(request, validVerificationPurpose(body.purpose), validLoginPortal(body.portal)));
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : ""; const position = Number(body.position);
    if (!challengeId || !Number.isFinite(position)) return Response.json({ error: "滑块参数不完整。" }, { status: 400 });
    return Response.json(await verifySliderChallenge(request, challengeId, position));
  } catch (error) { return authRouteError(error); }
}
