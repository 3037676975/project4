import { requireCategory, requireKnowledgeBase } from "../../../../lib/knowledge-spaces";
import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin", "member"]);
    const payload = await request.json() as { knowledgeBaseId?: unknown; documentId?: unknown; categoryId?: unknown };
    const knowledgeBaseId = typeof payload.knowledgeBaseId === "string" ? payload.knowledgeBaseId : "";
    const documentId = typeof payload.documentId === "string" ? payload.documentId : "";
    const categoryId = typeof payload.categoryId === "string" ? payload.categoryId : "";
    await requireKnowledgeBase(context.tenantId, knowledgeBaseId);
    await requireCategory(context.tenantId, knowledgeBaseId, categoryId);
    const runtime = getRuntime();
    const document = await runtime.DB.prepare(`SELECT id, category_id FROM knowledge_documents
      WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ? AND status = 'ready'`)
      .bind(context.tenantId, knowledgeBaseId, documentId).first<{ id: string; category_id: string | null }>();
    if (!document) return Response.json({ error: "文档不存在或不属于当前知识库。" }, { status: 404 });
    if (document.category_id === categoryId) return Response.json({ moved: true, documentId, categoryId });
    const last = await runtime.DB.prepare(`SELECT COALESCE(MAX(position), 0) AS max_position FROM knowledge_documents
      WHERE tenant_id = ? AND knowledge_base_id = ? AND category_id = ?`)
      .bind(context.tenantId, knowledgeBaseId, categoryId).first<{ max_position: number }>();
    const now = new Date().toISOString();
    await runtime.DB.batch([
      runtime.DB.prepare(`UPDATE knowledge_documents SET category_id = ?, position = ?, updated_at = ?
        WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?`)
        .bind(categoryId, Number(last?.max_position ?? 0) + 1, now, context.tenantId, knowledgeBaseId, documentId),
      runtime.DB.prepare(`UPDATE knowledge_chunks SET category_id = ?
        WHERE tenant_id = ? AND knowledge_base_id = ? AND document_id = ?`)
        .bind(categoryId, context.tenantId, knowledgeBaseId, documentId),
    ]);
    return Response.json({ moved: true, documentId, categoryId, updatedAt: now });
  } catch (error) { return routeError(error); }
}
