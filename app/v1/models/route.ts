import { authenticateCustomerApiKey, openAiErrorResponse } from "../../../lib/api-keys";
import { getRuntime } from "../../../lib/runtime";

export async function GET(request: Request) {
  try {
    const context = await authenticateCustomerApiKey(request, "models");
    const result = await getRuntime().DB.prepare(`SELECT id, model_alias, name, created_at FROM assistants
      WHERE tenant_id = ? AND status = 'active' ${context.assistantId ? "AND id = ?" : ""} ORDER BY created_at`
    ).bind(...(context.assistantId ? [context.tenantId, context.assistantId] : [context.tenantId])).all();
    return Response.json({ object: "list", data: (result.results as Array<Record<string, unknown>>).map((row) => ({ id: row.model_alias, object: "model", created: Math.floor(new Date(String(row.created_at)).getTime() / 1000), owned_by: "knowledge-saas", metadata: { assistant_id: row.id, name: row.name } })) });
  } catch (error) { return openAiErrorResponse(error); }
}
