import { requireKnowledgeBase } from "../../../lib/knowledge-spaces";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request);
    const row = await getRuntime().DB.prepare(`SELECT id, name, model_alias, knowledge_base_id, system_prompt, temperature_milli, top_k, quality_threshold_milli, fallback_message, version, updated_at
      FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1`).bind(context.tenantId).first<Record<string, unknown>>();
    if (!row) return Response.json({ error: "助手尚未初始化。" }, { status: 404 });
    return Response.json({ id: row.id, name: row.name, modelAlias: row.model_alias, knowledgeBaseId: row.knowledge_base_id, systemPrompt: row.system_prompt, temperature: Number(row.temperature_milli) / 1000, topK: row.top_k,
      qualityThreshold: Number(row.quality_threshold_milli) / 1000, fallbackMessage: row.fallback_message, version: row.version, updatedAt: row.updated_at });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const payload = await request.json() as { name?: unknown; modelAlias?: unknown; knowledgeBaseId?: unknown; systemPrompt?: unknown; temperature?: unknown; topK?: unknown; qualityThreshold?: unknown; fallbackMessage?: unknown };
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 80) : "";
    const modelAlias = typeof payload.modelAlias === "string" ? payload.modelAlias.trim() : "";
    const systemPrompt = typeof payload.systemPrompt === "string" ? payload.systemPrompt.trim().slice(0, 6000) : "";
    const temperature = Number(payload.temperature); const topK = Math.round(Number(payload.topK));
    const qualityThreshold = Number(payload.qualityThreshold); const fallbackMessage = typeof payload.fallbackMessage === "string" ? payload.fallbackMessage.trim().slice(0, 500) : "";
    const knowledgeBaseId = typeof payload.knowledgeBaseId === "string" ? payload.knowledgeBaseId : "";
    if (!name || !systemPrompt || !/^[a-zA-Z0-9._-]{3,80}$/.test(modelAlias)) return Response.json({ error: "助手名称、模型别名和系统提示词不能为空。" }, { status: 400 });
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1.5) return Response.json({ error: "温度应在 0 到 1.5 之间。" }, { status: 400 });
    if (!Number.isInteger(topK) || topK < 1 || topK > 8) return Response.json({ error: "Top K 应在 1 到 8 之间。" }, { status: 400 });
    if (!Number.isFinite(qualityThreshold) || qualityThreshold < 0.3 || qualityThreshold > 0.95) return Response.json({ error: "最低可靠度应在 0.30 到 0.95 之间。" }, { status: 400 });
    if (!fallbackMessage) return Response.json({ error: "请设置资料不足时的拒答文案。" }, { status: 400 });
    await requireKnowledgeBase(context.tenantId, knowledgeBaseId);
    const updatedAt = new Date().toISOString(); const { DB } = getRuntime();
    const existing = await DB.prepare("SELECT id FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").bind(context.tenantId).first<{ id: string }>();
    if (!existing) return Response.json({ error: "助手尚未初始化。" }, { status: 404 });
    await DB.prepare(`UPDATE assistants SET name = ?, model_alias = ?, knowledge_base_id = ?, system_prompt = ?, temperature_milli = ?, top_k = ?,
      quality_threshold_milli = ?, fallback_message = ?, version = version + 1, updated_at = ?
      WHERE tenant_id = ? AND id = ?`).bind(name, modelAlias, knowledgeBaseId, systemPrompt, Math.round(temperature * 1000), topK,
      Math.round(qualityThreshold * 1000), fallbackMessage, updatedAt, context.tenantId, existing.id).run();
    const row = await DB.prepare("SELECT version FROM assistants WHERE id = ?").bind(existing.id).first<{ version: number }>();
    return Response.json({ saved: true, id: existing.id, name, modelAlias, knowledgeBaseId, systemPrompt, temperature, topK, qualityThreshold, fallbackMessage, version: row?.version ?? 1, updatedAt });
  } catch (error) { return routeError(error); }
}
