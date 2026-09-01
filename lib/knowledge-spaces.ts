import { getRuntime } from "./runtime";
import { TenantContext } from "./tenant";

export type KnowledgeBaseRow = {
  id: string;
  name: string;
  description: string;
  is_default: number;
  position: number;
};

export async function requireKnowledgeBase(tenantId: string, knowledgeBaseId: string) {
  const row = await getRuntime().DB.prepare(`SELECT id, name, description, is_default, position
    FROM knowledge_bases WHERE tenant_id = ? AND id = ? AND status = 'active'`)
    .bind(tenantId, knowledgeBaseId).first<KnowledgeBaseRow>();
  if (!row) throw Object.assign(new Error("知识库不存在或不属于当前租户。"), { status: 404 });
  return row;
}

export async function resolveKnowledgeBase(context: TenantContext, requestedId?: string | null) {
  if (requestedId) return requireKnowledgeBase(context.tenantId, requestedId);
  const active = await getRuntime().DB.prepare(`SELECT kb.id, kb.name, kb.description, kb.is_default, kb.position
    FROM tenant_members tm JOIN knowledge_bases kb ON kb.id = tm.active_knowledge_base_id AND kb.tenant_id = tm.tenant_id
    WHERE tm.tenant_id = ? AND tm.email = ? AND tm.status = 'active' AND kb.status = 'active'`)
    .bind(context.tenantId, context.email).first<KnowledgeBaseRow>();
  if (active) return active;
  const fallback = await getRuntime().DB.prepare(`SELECT id, name, description, is_default, position
    FROM knowledge_bases WHERE tenant_id = ? AND status = 'active'
    ORDER BY is_default DESC, position ASC, created_at ASC LIMIT 1`)
    .bind(context.tenantId).first<KnowledgeBaseRow>();
  if (!fallback) throw Object.assign(new Error("知识库尚未初始化。"), { status: 500 });
  return fallback;
}

export async function ensureDefaultCategory(tenantId: string, knowledgeBaseId: string) {
  await requireKnowledgeBase(tenantId, knowledgeBaseId);
  const id = `cat_default_${knowledgeBaseId}`;
  const now = new Date().toISOString();
  await getRuntime().DB.prepare(`INSERT OR IGNORE INTO knowledge_categories
    (id, tenant_id, knowledge_base_id, name, position, is_system, created_at, updated_at)
    VALUES (?, ?, ?, '未分类', 0, 1, ?, ?)`)
    .bind(id, tenantId, knowledgeBaseId, now, now).run();
  return id;
}

export async function requireCategory(tenantId: string, knowledgeBaseId: string, categoryId: string) {
  const row = await getRuntime().DB.prepare(`SELECT id, name, position, is_system
    FROM knowledge_categories WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?`)
    .bind(tenantId, knowledgeBaseId, categoryId)
    .first<{ id: string; name: string; position: number; is_system: number }>();
  if (!row) throw Object.assign(new Error("分类不存在或不属于当前知识库。"), { status: 404 });
  return row;
}
