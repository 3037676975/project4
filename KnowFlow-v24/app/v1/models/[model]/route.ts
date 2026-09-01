import { authenticateCustomerApiKey, openAiErrorResponse, PublicApiError } from "../../../../lib/api-keys";
import { getRuntime } from "../../../../lib/runtime";

export async function GET(request: Request, { params }: { params: Promise<{ model: string }> }) {
  try {
    const context = await authenticateCustomerApiKey(request, "models"); const { model } = await params;
    const row = await getRuntime().DB.prepare(`SELECT id, model_alias, name, created_at FROM assistants
      WHERE tenant_id = ? AND model_alias = ? AND status = 'active' ${context.assistantId ? "AND id = ?" : ""} LIMIT 1`
    ).bind(...(context.assistantId ? [context.tenantId, model, context.assistantId] : [context.tenantId, model])).first<Record<string, unknown>>();
    if (!row) throw new PublicApiError(404, `The model '${model}' does not exist`, "model_not_found");
    return Response.json({ id: row.model_alias, object: "model", created: Math.floor(new Date(String(row.created_at)).getTime() / 1000), owned_by: "knowledge-saas", metadata: { assistant_id: row.id, name: row.name } });
  } catch (error) { return openAiErrorResponse(error); }
}
