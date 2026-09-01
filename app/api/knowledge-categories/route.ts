import { ensureDefaultCategory, requireCategory, requireKnowledgeBase } from "../../../lib/knowledge-spaces";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 50) : "";
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request);
    const knowledgeBaseId = new URL(request.url).searchParams.get("knowledgeBaseId")?.trim() || "";
    await requireKnowledgeBase(context.tenantId, knowledgeBaseId);
    await ensureDefaultCategory(context.tenantId, knowledgeBaseId);
    const result = await getRuntime().DB.prepare(`SELECT c.id, c.name, c.position, c.is_system, c.created_at,
      COUNT(d.id) AS document_count
      FROM knowledge_categories c
      LEFT JOIN knowledge_documents d ON d.tenant_id = c.tenant_id AND d.knowledge_base_id = c.knowledge_base_id AND d.category_id = c.id
      WHERE c.tenant_id = ? AND c.knowledge_base_id = ?
      GROUP BY c.id ORDER BY c.is_system DESC, c.position ASC, c.created_at ASC`)
      .bind(context.tenantId, knowledgeBaseId).all();
    return Response.json({ categories: (result.results as Array<Record<string, unknown>>).map((row) => ({
      id: row.id, name: row.name, position: Number(row.position), isSystem: Boolean(row.is_system),
      documentCount: Number(row.document_count || 0), createdAt: row.created_at,
    })) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin", "member"]);
    const payload = await request.json() as { knowledgeBaseId?: unknown; name?: unknown };
    const knowledgeBaseId = typeof payload.knowledgeBaseId === "string" ? payload.knowledgeBaseId : "";
    await requireKnowledgeBase(context.tenantId, knowledgeBaseId);
    const name = cleanName(payload.name);
    if (name.length < 1) return Response.json({ error: "请输入分类名称。" }, { status: 400 });
    const runtime = getRuntime();
    const stats = await runtime.DB.prepare("SELECT COUNT(*) AS count, COALESCE(MAX(position), 0) AS max_position FROM knowledge_categories WHERE tenant_id = ? AND knowledge_base_id = ?")
      .bind(context.tenantId, knowledgeBaseId).first<{ count: number; max_position: number }>();
    if ((stats?.count ?? 0) >= 50) return Response.json({ error: "每个知识库最多创建 50 个分类。" }, { status: 409 });
    const duplicate = await runtime.DB.prepare("SELECT id FROM knowledge_categories WHERE tenant_id = ? AND knowledge_base_id = ? AND name = ?")
      .bind(context.tenantId, knowledgeBaseId, name).first();
    if (duplicate) return Response.json({ error: "当前知识库已经存在同名分类。" }, { status: 409 });
    const id = `cat_${crypto.randomUUID().replaceAll("-", "")}`; const now = new Date().toISOString(); const position = Number(stats?.max_position ?? 0) + 1;
    await runtime.DB.prepare(`INSERT INTO knowledge_categories
      (id, tenant_id, knowledge_base_id, name, position, is_system, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(id, context.tenantId, knowledgeBaseId, name, position, now, now).run();
    return Response.json({ id, name, position, isSystem: false, documentCount: 0, createdAt: now }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin", "member"]);
    const payload = await request.json() as { knowledgeBaseId?: unknown; id?: unknown; name?: unknown };
    const knowledgeBaseId = typeof payload.knowledgeBaseId === "string" ? payload.knowledgeBaseId : "";
    const id = typeof payload.id === "string" ? payload.id : "";
    await requireKnowledgeBase(context.tenantId, knowledgeBaseId);
    const category = await requireCategory(context.tenantId, knowledgeBaseId, id);
    if (category.is_system) return Response.json({ error: "系统分类不能修改名称。" }, { status: 400 });
    const name = cleanName(payload.name);
    if (!name) return Response.json({ error: "请输入分类名称。" }, { status: 400 });
    const duplicate = await getRuntime().DB.prepare(`SELECT id FROM knowledge_categories
      WHERE tenant_id = ? AND knowledge_base_id = ? AND name = ? AND id <> ?`)
      .bind(context.tenantId, knowledgeBaseId, name, id).first();
    if (duplicate) return Response.json({ error: "当前知识库已经存在同名分类。" }, { status: 409 });
    const now = new Date().toISOString();
    await getRuntime().DB.prepare("UPDATE knowledge_categories SET name = ?, updated_at = ? WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?")
      .bind(name, now, context.tenantId, knowledgeBaseId, id).run();
    return Response.json({ id, name, updatedAt: now });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const url = new URL(request.url); const knowledgeBaseId = url.searchParams.get("knowledgeBaseId")?.trim() || ""; const id = url.searchParams.get("id")?.trim() || "";
    await requireKnowledgeBase(context.tenantId, knowledgeBaseId);
    const category = await requireCategory(context.tenantId, knowledgeBaseId, id);
    if (category.is_system) return Response.json({ error: "“未分类”是系统分类，不能删除。" }, { status: 400 });
    const fallbackId = await ensureDefaultCategory(context.tenantId, knowledgeBaseId); const runtime = getRuntime(); const now = new Date().toISOString();
    const count = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM knowledge_documents WHERE tenant_id = ? AND knowledge_base_id = ? AND category_id = ?")
      .bind(context.tenantId, knowledgeBaseId, id).first<{ count: number }>();
    await runtime.DB.batch([
      runtime.DB.prepare("UPDATE knowledge_documents SET category_id = ?, updated_at = ? WHERE tenant_id = ? AND knowledge_base_id = ? AND category_id = ?").bind(fallbackId, now, context.tenantId, knowledgeBaseId, id),
      runtime.DB.prepare("UPDATE knowledge_chunks SET category_id = ? WHERE tenant_id = ? AND knowledge_base_id = ? AND category_id = ?").bind(fallbackId, context.tenantId, knowledgeBaseId, id),
      runtime.DB.prepare("DELETE FROM knowledge_categories WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?").bind(context.tenantId, knowledgeBaseId, id),
    ]);
    return Response.json({ deleted: true, movedDocuments: count?.count ?? 0, fallbackCategoryId: fallbackId });
  } catch (error) { return routeError(error); }
}
