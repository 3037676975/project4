import { ensureDefaultCategory, requireKnowledgeBase, resolveKnowledgeBase } from "../../../lib/knowledge-spaces";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 60) : "";
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request);
    const active = await resolveKnowledgeBase(context);
    const result = await getRuntime().DB.prepare(`SELECT kb.id, kb.name, kb.description, kb.is_default, kb.position, kb.created_at,
      COUNT(DISTINCT d.id) AS document_count, COUNT(DISTINCT c.id) AS category_count,
      COUNT(DISTINCT a.id) AS assistant_count
      FROM knowledge_bases kb
      LEFT JOIN knowledge_documents d ON d.tenant_id = kb.tenant_id AND d.knowledge_base_id = kb.id
      LEFT JOIN knowledge_categories c ON c.tenant_id = kb.tenant_id AND c.knowledge_base_id = kb.id
      LEFT JOIN assistants a ON a.tenant_id = kb.tenant_id AND a.knowledge_base_id = kb.id AND a.status = 'active'
      WHERE kb.tenant_id = ? AND kb.status = 'active'
      GROUP BY kb.id ORDER BY kb.is_default DESC, kb.position ASC, kb.created_at ASC`)
      .bind(context.tenantId).all();
    return Response.json({
      activeKnowledgeBaseId: active.id,
      knowledgeBases: (result.results as Array<Record<string, unknown>>).map((row) => ({
        id: row.id, name: row.name, description: row.description, isDefault: Boolean(row.is_default),
        position: row.position, documentCount: Number(row.document_count || 0), categoryCount: Number(row.category_count || 0),
        assistantCount: Number(row.assistant_count || 0), createdAt: row.created_at,
      })),
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const payload = await request.json() as { name?: unknown; description?: unknown };
    const name = cleanName(payload.name); const description = cleanName(payload.description).slice(0, 160);
    if (name.length < 2) return Response.json({ error: "知识库名称至少需要 2 个字符。" }, { status: 400 });
    const runtime = getRuntime();
    const total = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM knowledge_bases WHERE tenant_id = ? AND status = 'active'")
      .bind(context.tenantId).first<{ count: number }>();
    if ((total?.count ?? 0) >= 20) return Response.json({ error: "每个租户最多创建 20 个知识库。" }, { status: 409 });
    const duplicate = await runtime.DB.prepare("SELECT id FROM knowledge_bases WHERE tenant_id = ? AND status = 'active' AND name = ?")
      .bind(context.tenantId, name).first();
    if (duplicate) return Response.json({ error: "当前租户已经存在同名知识库。" }, { status: 409 });
    const id = `kb_${crypto.randomUUID().replaceAll("-", "")}`; const now = new Date().toISOString();
    await runtime.DB.prepare(`INSERT INTO knowledge_bases
      (id, tenant_id, name, description, status, is_default, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?)`)
      .bind(id, context.tenantId, name, description, total?.count ?? 0, now, now).run();
    await ensureDefaultCategory(context.tenantId, id);
    return Response.json({ id, name, description, isDefault: false, documentCount: 0, categoryCount: 1, assistantCount: 0, createdAt: now }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await getOrCreateTenant(request);
    const payload = await request.json() as { id?: unknown; action?: unknown; name?: unknown; description?: unknown };
    const id = typeof payload.id === "string" ? payload.id : "";
    const base = await requireKnowledgeBase(context.tenantId, id);
    if (payload.action === "select") {
      await getRuntime().DB.prepare(`UPDATE tenant_members SET active_knowledge_base_id = ?, updated_at = ?
        WHERE tenant_id = ? AND email = ? AND status = 'active'`)
        .bind(base.id, new Date().toISOString(), context.tenantId, context.email).run();
      return Response.json({ selected: true, id: base.id });
    }
    requireRole(context, ["owner", "admin"]);
    const name = cleanName(payload.name); const description = cleanName(payload.description).slice(0, 160);
    if (name.length < 2) return Response.json({ error: "知识库名称至少需要 2 个字符。" }, { status: 400 });
    const duplicate = await getRuntime().DB.prepare(`SELECT id FROM knowledge_bases
      WHERE tenant_id = ? AND status = 'active' AND name = ? AND id <> ?`)
      .bind(context.tenantId, name, id).first();
    if (duplicate) return Response.json({ error: "当前租户已经存在同名知识库。" }, { status: 409 });
    const now = new Date().toISOString();
    await getRuntime().DB.prepare("UPDATE knowledge_bases SET name = ?, description = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
      .bind(name, description, now, context.tenantId, id).run();
    return Response.json({ id, name, description, updatedAt: now });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const id = new URL(request.url).searchParams.get("id")?.trim() || "";
    const base = await requireKnowledgeBase(context.tenantId, id);
    if (base.is_default) return Response.json({ error: "默认知识库不能删除。" }, { status: 400 });
    const runtime = getRuntime();
    const usage = await runtime.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM knowledge_documents WHERE tenant_id = ? AND knowledge_base_id = ?) AS documents,
      (SELECT COUNT(*) FROM assistants WHERE tenant_id = ? AND knowledge_base_id = ? AND status = 'active') AS assistants`)
      .bind(context.tenantId, id, context.tenantId, id).first<{ documents: number; assistants: number }>();
    if ((usage?.documents ?? 0) > 0) return Response.json({ error: "请先移动或删除该知识库中的文档。" }, { status: 409 });
    if ((usage?.assistants ?? 0) > 0) return Response.json({ error: "该知识库仍绑定助手，请先为助手选择其他知识库。" }, { status: 409 });
    const fallback = await runtime.DB.prepare(`SELECT id FROM knowledge_bases
      WHERE tenant_id = ? AND status = 'active' AND id <> ? ORDER BY is_default DESC, position ASC, created_at ASC LIMIT 1`)
      .bind(context.tenantId, id).first<{ id: string }>();
    if (!fallback) return Response.json({ error: "租户必须保留至少一个知识库。" }, { status: 409 });
    await runtime.DB.batch([
      runtime.DB.prepare("DELETE FROM knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ?").bind(context.tenantId, id),
      runtime.DB.prepare("DELETE FROM knowledge_categories WHERE tenant_id = ? AND knowledge_base_id = ?").bind(context.tenantId, id),
      runtime.DB.prepare("UPDATE knowledge_bases SET status = 'deleted', updated_at = ? WHERE tenant_id = ? AND id = ?").bind(new Date().toISOString(), context.tenantId, id),
      runtime.DB.prepare("UPDATE tenant_members SET active_knowledge_base_id = ? WHERE tenant_id = ? AND active_knowledge_base_id = ?").bind(fallback.id, context.tenantId, id),
    ]);
    return Response.json({ deleted: true, id });
  } catch (error) { return routeError(error); }
}
