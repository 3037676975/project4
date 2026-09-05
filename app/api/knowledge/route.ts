import { extractText, getDocumentProxy } from "unpdf";
import { BUILTIN_MANUAL } from "../../../lib/knowledge";
import { ensureDefaultCategory, requireCategory, resolveKnowledgeBase } from "../../../lib/knowledge-spaces";
import { ensureBuiltinChunks, indexDocument, parseDocumentWithConfiguredOcr } from "../../../lib/rag";
import { loadProviderConfig } from "../../../lib/provider";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";
import { calculateOcrCost } from "../../../lib/costs";
import { deleteQdrantDocument } from "../../../lib/qdrant";
import { isBuiltinManualVisible } from "../../../lib/platform-settings";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 700_000;
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json"]);
const PARSER_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "pptx", "png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"]);

function cleanName(value: string) { return value.trim().replace(/[\\/]+/g, "-").slice(0, 160) || "未命名知识文档"; }
function extension(name: string) { return name.toLowerCase().split(".").pop() || ""; }

function localOcrErrorMessage(error: unknown) {
  const raw = error instanceof Error && error.message.trim() ? error.message.trim() : "未知错误";
  return raw
    .replace(/^Docling 服务/, "本地 PaddleOCR 服务")
    .replace(/^Docling 没有提取到可用文字/, "本地 PaddleOCR 没有提取到可用文字")
    .slice(0, 500);
}

async function parseTenantOcr(tenantId: string, file: File, mode: "auto" | "text" | "table") {
  try {
    const parsed = await parseDocumentWithConfiguredOcr(tenantId, file, mode);
    if (!parsed) throw new Error("本地 PaddleOCR 未启动或内部鉴权不可用");
    return parsed;
  } catch (error) {
    console.error("[knowflow-ocr] tenant upload inference failed", {
      tenantId,
      fileName: file.name,
      fileSize: file.size,
      mode,
      error,
    });
    // This is an expected upstream OCR failure, not an unknown application
    // crash. Mark it as a 422 so the UI receives the useful, sanitized reason
    // instead of routeError's generic "服务暂时不可用" message.
    throw Object.assign(new Error(`本地 PaddleOCR 实际识别失败：${localOcrErrorMessage(error)}`), { status: 422 });
  }
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const url = new URL(request.url);
    const kb = await resolveKnowledgeBase(context, url.searchParams.get("knowledgeBaseId")); const { DB } = getRuntime();
    await ensureDefaultCategory(context.tenantId, kb.id);
    const inheritedEmbedding = await loadProviderConfig(context.tenantId, "embedding").catch(() => null);
    if (inheritedEmbedding) {
      const pending = await DB.prepare(`SELECT id, category_id, extracted_text FROM knowledge_documents
        WHERE tenant_id = ? AND knowledge_base_id = ? AND status = 'ready' AND index_status = 'needs_embedding' AND LENGTH(extracted_text) >= 10
        ORDER BY updated_at ASC LIMIT 2`).bind(context.tenantId, kb.id).all<{ id: string; category_id: string | null; extracted_text: string }>();
      for (const row of pending.results) {
        try {
          await DB.prepare("UPDATE knowledge_documents SET index_status = 'indexing', updated_at = ? WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?")
            .bind(new Date().toISOString(), context.tenantId, kb.id, row.id).run();
          await indexDocument({ tenantId: context.tenantId, knowledgeBaseId: kb.id, categoryId: row.category_id, documentId: row.id, text: row.extracted_text });
        } catch (error) {
          console.error("[knowflow-rag] inherited platform Embedding reindex failed", row.id, error);
          await DB.prepare("UPDATE knowledge_documents SET index_status = 'needs_embedding', updated_at = ? WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?")
            .bind(new Date().toISOString(), context.tenantId, kb.id, row.id).run();
        }
      }
    }
    const result = await DB.prepare(`SELECT id, category_id, position, name, mime_type, char_count, page_count, status,
      index_status, chunk_count, ocr_used, created_at, updated_at
      FROM knowledge_documents WHERE tenant_id = ? AND knowledge_base_id = ?
      ORDER BY category_id, position ASC, created_at DESC LIMIT 500`)
      .bind(context.tenantId, kb.id).all();
    const documents = (result.results as Array<Record<string, unknown>>).map((row) => ({
      id: row.id, categoryId: row.category_id, position: Number(row.position), name: row.name, mimeType: row.mime_type,
      charCount: Number(row.char_count), pageCount: row.page_count, status: row.status, indexStatus: row.index_status,
      chunkCount: Number(row.chunk_count), ocrUsed: Boolean(row.ocr_used), createdAt: row.created_at, builtIn: false,
    }));
    if (kb.is_default && await isBuiltinManualVisible()) {
      if (inheritedEmbedding) await ensureBuiltinChunks(context.tenantId, kb.id).catch((error) => console.error("[knowflow-rag] builtin manual embedding repair failed", error));
      const builtin = await DB.prepare(`SELECT COUNT(*) AS count, MAX(embedding_model) AS model
        FROM knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ? AND document_id = ?`)
        .bind(context.tenantId, kb.id, BUILTIN_MANUAL.id).first<{ count: number; model: string | null }>();
      documents.unshift({
        id: BUILTIN_MANUAL.id, categoryId: "builtin", position: 0, name: BUILTIN_MANUAL.name, mimeType: BUILTIN_MANUAL.mimeType,
        charCount: BUILTIN_MANUAL.charCount, pageCount: BUILTIN_MANUAL.pageCount, status: "ready",
        indexStatus: (builtin?.count ?? 0) > 0 ? (builtin?.model ? "indexed" : "needs_embedding") : "pending",
        chunkCount: builtin?.count ?? 0, ocrUsed: false, createdAt: BUILTIN_MANUAL.createdAt, builtIn: true,
      });
    }
    return Response.json({ knowledgeBase: { id: kb.id, name: kb.name, description: kb.description, isDefault: Boolean(kb.is_default) }, documents });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin", "member"]);
    const runtime = getRuntime();
    let form: FormData; try { form = await request.formData(); } catch { return Response.json({ error: "上传内容格式不正确。" }, { status: 400 }); }
    const requestedKnowledgeBaseId = typeof form.get("knowledgeBaseId") === "string" ? String(form.get("knowledgeBaseId")) : null;
    const kb = await resolveKnowledgeBase(context, requestedKnowledgeBaseId);
    const defaultCategoryId = await ensureDefaultCategory(context.tenantId, kb.id);
    const requestedCategoryId = typeof form.get("categoryId") === "string" ? String(form.get("categoryId")) : "";
    const requestedRecognitionMode = typeof form.get("recognitionMode") === "string" ? String(form.get("recognitionMode")) : "auto";
    const recognitionMode: "auto" | "text" | "table" = requestedRecognitionMode === "table" ? "table" : requestedRecognitionMode === "text" ? "text" : "auto";
    const categoryId = requestedCategoryId || defaultCategoryId;
    await requireCategory(context.tenantId, kb.id, categoryId);
    const fileValue = form.get("file"); const pastedText = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";
    const requestedName = typeof form.get("name") === "string" ? String(form.get("name")) : ""; const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    if (!file && !pastedText) return Response.json({ error: "请选择文件或粘贴知识内容。" }, { status: 400 });
    if (file && file.size > MAX_FILE_BYTES) return Response.json({ error: "单个文件不能超过 12 MB。" }, { status: 413 });
    const plan = await runtime.DB.prepare(`SELECT p.storage_quota_bytes FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ? AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1`).bind(context.tenantId).first<{ storage_quota_bytes: number }>();
    const stored = await runtime.DB.prepare("SELECT COALESCE(SUM(char_count * 2), 0) AS used FROM knowledge_documents WHERE tenant_id = ?").bind(context.tenantId).first<{ used: number }>();
    if ((stored?.used ?? 0) + (file?.size ?? pastedText.length * 2) > (plan?.storage_quota_bytes ?? 0)) return Response.json({ error: "已超过当前套餐的知识库存储配额。" }, { status: 429 });

    const id = crypto.randomUUID(); const now = new Date().toISOString(); const name = cleanName(requestedName || file?.name || "粘贴文本.txt");
    let mimeType = file?.type || "application/octet-stream"; let originalBytes: ArrayBuffer; let extracted = pastedText; let pageCount: number | null = null; let ocrUsed = false; let ocrEngine = "";
    if (file) {
      const ext = extension(file.name);
      if (!TEXT_EXTENSIONS.has(ext) && !PARSER_EXTENSIONS.has(ext)) return Response.json({ error: "支持 PDF、Word(DOCX)、Excel(XLSX)、PPTX、图片、TXT、Markdown、CSV 和 JSON。" }, { status: 415 });
      originalBytes = await file.arrayBuffer(); const isPdf = mimeType === "application/pdf" || ext === "pdf";
      if (isPdf) {
        mimeType = "application/pdf";
        if (recognitionMode === "auto") {
          try { const pdf = await getDocumentProxy(new Uint8Array(originalBytes)); const parsed = await extractText(pdf, { mergePages: true }); extracted = String(parsed.text); pageCount = parsed.totalPages; }
          catch { extracted = ""; }
        } else extracted = "";
        if (extracted.replace(/\s/g, "").length < 30 || recognitionMode !== "auto") {
          const parsed = await parseTenantOcr(context.tenantId, file, recognitionMode);
          extracted = parsed.text; pageCount = parsed.pageCount ?? pageCount; ocrUsed = true; ocrEngine = parsed.engine;
        }
      } else if (TEXT_TYPES.has(mimeType) || TEXT_EXTENSIONS.has(ext)) extracted = new TextDecoder().decode(originalBytes);
      else {
        const parsed = await parseTenantOcr(context.tenantId, file, recognitionMode);
        extracted = parsed.text; pageCount = parsed.pageCount; ocrUsed = true; ocrEngine = parsed.engine;
      }
      if (!mimeType) mimeType = "application/octet-stream";
    } else { originalBytes = new TextEncoder().encode(pastedText).buffer; mimeType = "text/plain"; }
    extracted = extracted.replace(/\u0000/g, "").trim();
    if (extracted.length < 10) return Response.json({ error: "没有提取到足够的可检索文字。" }, { status: 422 });
    if (extracted.length > MAX_TEXT_CHARS) return Response.json({ error: "提取文本过长，请拆分为较小文件后上传。" }, { status: 413 });
    const last = await runtime.DB.prepare(`SELECT COALESCE(MAX(position), 0) AS max_position FROM knowledge_documents
      WHERE tenant_id = ? AND knowledge_base_id = ? AND category_id = ?`)
      .bind(context.tenantId, kb.id, categoryId).first<{ max_position: number }>();
    const position = Number(last?.max_position ?? 0) + 1;
    const objectKey = `tenant/${context.tenantId}/kb/${kb.id}/category/${categoryId}/${id}/${encodeURIComponent(name)}`;
    try {
      await runtime.BUCKET.put(objectKey, originalBytes, { httpMetadata: { contentType: mimeType } });
    } catch (error) {
      console.error("[knowflow-storage] document upload failed after extraction", { tenantId: context.tenantId, objectKey, error });
      return Response.json({ error: "OCR 已完成，但知识库原文件存储失败，请稍后重试。" }, { status: 503 });
    }
    try {
      await runtime.DB.prepare(`INSERT INTO knowledge_documents
        (id, tenant_id, knowledge_base_id, category_id, position, name, mime_type, object_key, extracted_text, char_count,
         page_count, status, index_status, chunk_count, ocr_used, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 'indexing', 0, ?, ?, ?)`)
        .bind(id, context.tenantId, kb.id, categoryId, position, name, mimeType, objectKey, extracted, extracted.length, pageCount, ocrUsed ? 1 : 0, now, now).run();
    } catch (error) { await runtime.BUCKET.delete(objectKey).catch(() => undefined); throw error; }
    let indexing: { chunkCount: number; indexed: boolean; model: string | null }; let indexingWarning: string | null = null;
    try { indexing = await indexDocument({ tenantId: context.tenantId, knowledgeBaseId: kb.id, categoryId, documentId: id, text: extracted }); }
    catch (error) { await runtime.DB.prepare("UPDATE knowledge_documents SET index_status = 'failed', updated_at = ? WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?").bind(new Date().toISOString(), context.tenantId, kb.id, id).run(); indexing = { chunkCount: 0, indexed: false, model: null }; indexingWarning = `文档已保存，但向量化失败：${error instanceof Error ? error.message : "Embedding 服务异常"}`; }
    if (ocrUsed) {
      // OCR usage telemetry must never turn a successfully imported document
      // into a 500 response. Local PaddleOCR is free, so log best-effort only.
      try {
        const costMicros = await calculateOcrCost({ tenantId: context.tenantId, engine: `ocr:${ocrEngine || "configured"}`, pages: pageCount || 1 });
        await runtime.DB.prepare(`INSERT INTO usage_records
          (id, tenant_id, request_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, source_count, credits, cost_micros, status, created_at)
          VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, 0, ?, 'success', ?)`)
          .bind(crypto.randomUUID(), context.tenantId, `ocr_${id}`, `ocr:${ocrEngine || "configured"}`, pageCount || 1, costMicros, now).run();
      } catch (error) {
        console.error("[knowflow-ocr] usage telemetry failed after successful import", { tenantId: context.tenantId, documentId: id, error });
      }
    }
    return Response.json({ document: { id, categoryId, position, name, mimeType, charCount: extracted.length, pageCount, status: "ready", indexStatus: indexing.chunkCount ? (indexing.indexed ? "indexed" : "needs_embedding") : "failed", chunkCount: indexing.chunkCount, ocrUsed, createdAt: now, builtIn: false }, warning: indexingWarning ?? (indexing.indexed ? null : "文档已保存；平台配置 Embedding 后会自动补齐向量索引。") }, { status: 201 });
  } catch (error) {
    console.error("[knowflow-knowledge] upload failed", error);
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id || id === BUILTIN_MANUAL.id) return Response.json({ error: "该文档不能删除。" }, { status: 400 });
    const runtime = getRuntime(); const row = await runtime.DB.prepare("SELECT object_key, knowledge_base_id FROM knowledge_documents WHERE tenant_id = ? AND id = ?").bind(context.tenantId, id).first<{ object_key: string; knowledge_base_id: string }>();
    if (!row) return Response.json({ error: "文档不存在。" }, { status: 404 });
    await deleteQdrantDocument(context.tenantId, row.knowledge_base_id, id).catch(() => undefined);
    await runtime.BUCKET.delete(row.object_key);
    await runtime.DB.batch([
      runtime.DB.prepare("DELETE FROM knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ? AND document_id = ?").bind(context.tenantId, row.knowledge_base_id, id),
      runtime.DB.prepare("DELETE FROM knowledge_documents WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?").bind(context.tenantId, row.knowledge_base_id, id),
    ]);
    return Response.json({ deleted: true });
  } catch (error) { return routeError(error); }
}
