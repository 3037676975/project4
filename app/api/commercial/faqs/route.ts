import { getRuntime } from "../../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../../lib/tenant";

function parseKeywords(value: unknown) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，\n]/) : [];
  return [...new Set(list.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
}
async function assistantId(tenantId: string) {
  return (await getRuntime().DB.prepare("SELECT id FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").bind(tenantId).first<{ id: string }>())?.id || null;
}
export async function GET(request: Request) {
  try { const context = await getOrCreateTenant(request); const id = await assistantId(context.tenantId); if (!id) return Response.json({ faqs: [] });
    const rows = await getRuntime().DB.prepare("SELECT id, question, answer, keywords_json, enabled, priority, hit_count, created_at, updated_at FROM customer_faqs WHERE tenant_id = ? AND assistant_id = ? ORDER BY priority DESC, updated_at DESC LIMIT 300").bind(context.tenantId, id).all<Record<string, unknown>>();
    return Response.json({ faqs: rows.results.map((row) => ({ id: row.id, question: row.question, answer: row.answer, keywords: JSON.parse(String(row.keywords_json || "[]")), enabled: Boolean(row.enabled), priority: Number(row.priority), hitCount: Number(row.hit_count), createdAt: row.created_at, updatedAt: row.updated_at })) });
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
  try { const context = await getOrCreateTenant(request); requireRole(context, ["owner","admin"]); const id = await assistantId(context.tenantId); if (!id) return Response.json({ error: "助手尚未初始化。" }, { status: 404 });
    const body = await request.json() as Record<string, unknown>; const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : ""; const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 4000) : "";
    if (!question || !answer) return Response.json({ error: "FAQ 问题和答案不能为空。" }, { status: 400 });
    const now = new Date().toISOString(); const faqId = `faq_${crypto.randomUUID().replaceAll("-", "")}`;
    await getRuntime().DB.prepare("INSERT INTO customer_faqs (id, tenant_id, assistant_id, question, answer, keywords_json, enabled, priority, hit_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
      .bind(faqId, context.tenantId, id, question, answer, JSON.stringify(parseKeywords(body.keywords)), body.enabled === false ? 0 : 1, Math.max(0, Math.min(1000, Math.round(Number(body.priority ?? 100)))), now, now).run();
    return Response.json({ saved: true, id: faqId }, { status: 201 });
  } catch (error) { return routeError(error); }
}
export async function PATCH(request: Request) {
  try { const context = await getOrCreateTenant(request); requireRole(context, ["owner","admin"]); const body = await request.json() as Record<string, unknown>; const id = typeof body.id === "string" ? body.id : "";
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : ""; const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 4000) : ""; if (!id || !question || !answer) return Response.json({ error: "FAQ 参数不完整。" }, { status: 400 });
    const result = await getRuntime().DB.prepare("UPDATE customer_faqs SET question = ?, answer = ?, keywords_json = ?, enabled = ?, priority = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(question, answer, JSON.stringify(parseKeywords(body.keywords)), body.enabled === false ? 0 : 1, Math.max(0, Math.min(1000, Math.round(Number(body.priority ?? 100)))), new Date().toISOString(), id, context.tenantId).run();
    if (!result.meta.changes) return Response.json({ error: "FAQ 不存在。" }, { status: 404 }); return Response.json({ saved: true });
  } catch (error) { return routeError(error); }
}
export async function DELETE(request: Request) {
  try { const context = await getOrCreateTenant(request); requireRole(context, ["owner","admin"]); const id = new URL(request.url).searchParams.get("id") || ""; if (!id) return Response.json({ error: "缺少 FAQ ID。" }, { status: 400 });
    await getRuntime().DB.prepare("DELETE FROM customer_faqs WHERE id = ? AND tenant_id = ?").bind(id, context.tenantId).run(); return Response.json({ deleted: true });
  } catch (error) { return routeError(error); }
}
