import { qdrantHealth } from "../../../lib/qdrant";
import { getOrCreateTenant, routeError } from "../../../lib/tenant";

export async function GET(request: Request) {
  try { await getOrCreateTenant(request); return Response.json({ provider: "qdrant", ...(await qdrantHealth()), fallback: "D1 hybrid retrieval" }); }
  catch (error) { return routeError(error); }
}
