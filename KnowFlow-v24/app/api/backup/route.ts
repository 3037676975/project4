import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";
import { sha256 } from "../../../lib/security";
import { exportQdrantVectors } from "../../../lib/qdrant";

const TENANT_TABLES = [
  "tenant_members", "tenant_invitations", "subscriptions", "entitlements", "credit_ledger", "tenant_usage_monthly",
  "tenant_provider_configs", "knowledge_bases", "knowledge_categories", "knowledge_documents", "knowledge_chunks", "assistants",
  "customer_conversations", "customer_messages", "customer_leads", "support_tickets", "ticket_events", "privacy_consents",
  "privacy_requests", "notification_configs", "notification_outbox", "customer_api_keys", "traces", "usage_records", "billing_orders",
  "order_fulfillments", "refund_requests", "cost_settings", "quality_test_cases", "quality_test_runs", "channel_configs", "channel_events",
] as const;

function base64(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function fromBase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner"]); const runtime = getRuntime();
    const tenant = await runtime.DB.prepare("SELECT * FROM tenants WHERE id = ?").bind(context.tenantId).first<Record<string, unknown>>();
    const encoder = new TextEncoder(); const exportedAt = new Date().toISOString();
    const encryptionFingerprint = runtime.CONFIG_ENCRYPTION_KEY ? (await sha256(runtime.CONFIG_ENCRYPTION_KEY)).slice(0, 16) : null;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const line = (value: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        try {
          line({ type: "manifest", format: "knowflow-backup", version: 1, exportedAt, sourceTenantId: context.tenantId, encryptionFingerprint,
            note: "模型密钥为加密密文；恢复时必须使用同一个 CONFIG_ENCRYPTION_KEY。客户 API Key 仅存哈希，无法导出明文。" });
          if (tenant) line({ type: "row", table: "tenants", data: tenant });
          for (const table of TENANT_TABLES) {
            const result = await runtime.DB.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?`).bind(context.tenantId).all();
            const rows = result.results as Array<Record<string, unknown>>;
            if (table === "knowledge_chunks") {
              const qdrantRows = rows.filter((row) => row.vector_store === "qdrant" && typeof row.vector_point_id === "string");
              const vectors = await exportQdrantVectors(qdrantRows.map((row) => String(row.vector_point_id))).catch(() => new Map<string, number[]>());
              for (const row of rows) {
                const vector = typeof row.vector_point_id === "string" ? vectors.get(row.vector_point_id) : null;
                line({ type: "row", table, data: row.vector_store === "qdrant" ? { ...row, embedding_json: vector ? JSON.stringify(vector) : row.embedding_json, vector_store: "d1", vector_point_id: null } : row });
              }
              if (qdrantRows.length && vectors.size !== qdrantRows.length) line({ type: "warning", message: `${qdrantRows.length - vectors.size} 个 Qdrant 向量未能导出，恢复后对应文档需要重新向量化。` });
            } else for (const row of rows) line({ type: "row", table, data: row });
          }
          const documents = await runtime.DB.prepare("SELECT id, object_key, mime_type, name FROM knowledge_documents WHERE tenant_id = ?").bind(context.tenantId).all();
          for (const document of documents.results as Array<{ id: string; object_key: string; mime_type: string; name: string }>) {
            const object = await runtime.BUCKET.get(document.object_key); if (!object) { line({ type: "warning", documentId: document.id, message: "R2 原文件缺失" }); continue; }
            const bytes = new Uint8Array(await object.arrayBuffer()); line({ type: "file", documentId: document.id, objectKey: document.object_key, mimeType: document.mime_type, name: document.name, size: bytes.byteLength, data: base64(bytes) });
          }
          line({ type: "complete", exportedAt: new Date().toISOString() }); controller.close();
        } catch (error) { controller.error(error); }
      },
    });
    const filename = `knowflow-${context.tenantId.slice(-8)}-${exportedAt.slice(0, 10)}.jsonl`;
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}

async function tableColumns(table: string) {
  const result = await getRuntime().DB.prepare(`PRAGMA table_info(${table})`).all();
  return new Set((result.results as Array<{ name: string }>).map((row) => row.name));
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner"]); const form = await request.formData();
    if (form.get("confirm") !== "RESTORE") return Response.json({ error: "恢复操作需要输入 RESTORE 明确确认。" }, { status: 400 });
    const file = form.get("file"); if (!(file instanceof File) || !file.size) return Response.json({ error: "请选择 KnowFlow JSONL 备份文件。" }, { status: 400 });
    if (file.size > 200 * 1024 * 1024) return Response.json({ error: "浏览器恢复包不能超过 200 MB；更大租户请使用分批迁移工具。" }, { status: 413 });
    const lines = (await file.text()).split(/\r?\n/).filter(Boolean); if (!lines.length) return Response.json({ error: "备份文件为空。" }, { status: 400 });
    const manifest = JSON.parse(lines[0]) as Record<string, unknown>; if (manifest.type !== "manifest" || manifest.format !== "knowflow-backup" || manifest.version !== 1) return Response.json({ error: "备份格式或版本不受支持。" }, { status: 400 });
    const runtime = getRuntime(); const currentFingerprint = runtime.CONFIG_ENCRYPTION_KEY ? (await sha256(runtime.CONFIG_ENCRYPTION_KEY)).slice(0, 16) : null;
    if (manifest.encryptionFingerprint && manifest.encryptionFingerprint !== currentFingerprint) return Response.json({ error: "当前 CONFIG_ENCRYPTION_KEY 与备份不一致，恢复后模型密钥将无法解密。请先使用原加密密钥。" }, { status: 409 });
    const sourceTenantId = String(manifest.sourceTenantId || "");
    if (sourceTenantId && sourceTenantId !== context.tenantId) { const sourceStillExists = await runtime.DB.prepare("SELECT id FROM tenants WHERE id = ?").bind(sourceTenantId).first<{ id: string }>(); if (sourceStillExists) return Response.json({ error: "源租户仍存在于当前数据库。为避免主键覆盖，请在独立目标环境恢复，或直接恢复到源租户。" }, { status: 409 }); }
    const tables = new Set<string>(["tenants", ...TENANT_TABLES]); const columnCache = new Map<string, Set<string>>(); const needsReindex = new Set<string>(); let rows = 0; let files = 0;
    for (const rawLine of lines.slice(1)) {
      const item = JSON.parse(rawLine) as { type?: string; table?: string; data?: Record<string, unknown> | string; objectKey?: string; mimeType?: string };
      if (item.type === "row" && item.table && tables.has(item.table) && item.data && typeof item.data === "object") {
        const table = item.table; let columns = columnCache.get(table); if (!columns) { columns = await tableColumns(table); columnCache.set(table, columns); }
        const row = { ...(item.data as Record<string, unknown>) };
        if ("tenant_id" in row) row.tenant_id = context.tenantId;
        if (table === "tenants") { row.id = context.tenantId; if (sourceTenantId !== context.tenantId) row.slug = `${String(row.slug || "workspace")}-${context.tenantId.slice(-6)}`; }
        if (table === "tenant_members" && row.email === context.email) { row.id = context.memberId; row.role = "owner"; row.status = "active"; }
        if (table === "knowledge_documents" && typeof row.object_key === "string") row.object_key = row.object_key.replace(`tenant/${sourceTenantId}/`, `tenant/${context.tenantId}/`);
        if (table === "knowledge_chunks" && !row.embedding_json && typeof row.document_id === "string") { row.vector_store = "d1"; row.vector_point_id = null; needsReindex.add(row.document_id); }
        const keys = Object.keys(row).filter((key) => columns!.has(key)); if (!keys.length) continue;
        const sql = `INSERT OR REPLACE INTO ${table} (${keys.map((key) => `\`${key}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
        await runtime.DB.prepare(sql).bind(...keys.map((key) => row[key] ?? null)).run(); rows += 1;
      } else if (item.type === "file" && typeof item.objectKey === "string" && typeof item.data === "string") {
        const objectKey = item.objectKey.replace(`tenant/${sourceTenantId}/`, `tenant/${context.tenantId}/`);
        await runtime.BUCKET.put(objectKey, fromBase64(item.data), { httpMetadata: { contentType: item.mimeType || "application/octet-stream" } }); files += 1;
      }
    }
    for (const documentId of needsReindex) await runtime.DB.prepare("UPDATE knowledge_documents SET index_status = 'needs_embedding', updated_at = ? WHERE tenant_id = ? AND id = ?").bind(new Date().toISOString(), context.tenantId, documentId).run();
    return Response.json({ restored: true, rows, files, needsReindex: needsReindex.size, sourceTenantId, targetTenantId: context.tenantId });
  } catch (error) { return routeError(error); }
}
