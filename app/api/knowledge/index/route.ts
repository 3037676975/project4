import { BUILTIN_MANUAL } from "../../../../lib/knowledge";
import { resolveKnowledgeBase } from "../../../../lib/knowledge-spaces";
import { ensureBuiltinChunks, indexDocument } from "../../../../lib/rag";
import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";
import { deleteQdrantDocument } from "../../../../lib/qdrant";
import { isBuiltinManualApplied } from "../../../../lib/platform-settings";

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin", "member"]);
    let body: { id?: unknown; knowledgeBaseId?: unknown } = {};
    try { body = await request.json() as typeof body; } catch { /* current knowledge base, all documents */ }
    const id = typeof body.id === "string" ? body.id : null;
    const kb = await resolveKnowledgeBase(context, typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : null);
    const { DB } = getRuntime(); let builtinIndexed = 0; const builtinApplied = await isBuiltinManualApplied();
    if (kb.is_default && builtinApplied && (!id || id === BUILTIN_MANUAL.id)) {
      await deleteQdrantDocument(context.tenantId, kb.id, BUILTIN_MANUAL.id).catch(() => undefined);
      await DB.prepare("DELETE FROM knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ? AND document_id = ?")
        .bind(context.tenantId, kb.id, BUILTIN_MANUAL.id).run();
      await ensureBuiltinChunks(context.tenantId, kb.id);
      builtinIndexed = 1;
      if (id === BUILTIN_MANUAL.id) return Response.json({ indexed: 1 });
    } else if (id === BUILTIN_MANUAL.id) {
      return Response.json({ error: "当前知识库没有系统内置文档。" }, { status: 404 });
    }
    const sql = `SELECT id, knowledge_base_id, category_id, extracted_text FROM knowledge_documents
      WHERE tenant_id = ? AND knowledge_base_id = ? AND status = 'ready' ${id ? "AND id = ?" : ""}`;
    const result = await DB.prepare(sql).bind(...(id ? [context.tenantId, kb.id, id] : [context.tenantId, kb.id])).all();
    if (id && result.results.length === 0) return Response.json({ error: "文档不存在。" }, { status: 404 });
    const outputs = [];
    for (const row of result.results as Array<{ id: string; knowledge_base_id: string; category_id: string; extracted_text: string }>) {
      outputs.push(await indexDocument({ tenantId: context.tenantId, knowledgeBaseId: row.knowledge_base_id, categoryId: row.category_id, documentId: row.id, text: row.extracted_text }));
    }
    return Response.json({ indexed: outputs.length + builtinIndexed, documents: outputs });
  } catch (error) { return routeError(error); }
}
