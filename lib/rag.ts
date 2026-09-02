import { BUILTIN_MANUAL } from "./knowledge";
import { isBuiltinManualApplied } from "./platform-settings";
import { parseWithBaiduOcr, parseWithTencentOcr } from "./cloud-ocr";
import { loadProviderConfig, StoredProviderConfig } from "./provider";
import { getRuntime } from "./runtime";
import { deleteQdrantDocument, qdrantConfigured, queryQdrant, upsertQdrantPoints } from "./qdrant";
import { recordExternalUsage } from "./costs";

export type RetrievalSource = {
  documentId: string; document: string; chunkId: string; text: string;
  vectorScore: number; lexicalScore: number; rerankScore: number; confidenceScore: number;
};

export function splitIntoChunks(text: string, size = 850, overlap = 140) {
  const clean = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    let end = Math.min(cursor + size, clean.length);
    if (end < clean.length) {
      const points = [clean.lastIndexOf("。", end), clean.lastIndexOf("！", end), clean.lastIndexOf("？", end), clean.lastIndexOf("\n", end)];
      const boundary = Math.max(...points);
      if (boundary > cursor + size * 0.55) end = boundary + 1;
    }
    const chunk = clean.slice(cursor, end).trim(); if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }
  return chunks;
}

function terms(value: string) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const output = normalized.split(/\s+/).filter((item) => item.length > 1);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let index = 0; index < chinese.length - 1; index += 1) output.push(chinese[index] + chinese[index + 1]);
  return [...new Set(output)].slice(0, 100);
}

function lexicalScore(question: string, text: string) {
  const queryTerms = terms(question); const lower = text.toLowerCase(); let hits = 0;
  for (const term of queryTerms) if (lower.includes(term)) hits += term.length > 2 ? 2 : 1;
  return queryTerms.length ? Math.min(1, hits / (queryTerms.length * 2)) : 0;
}

function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0; let aa = 0; let bb = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; aa += a[index] ** 2; bb += b[index] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export async function embedTexts(tenantId: string, texts: string[]) {
  const config = await loadProviderConfig(tenantId, "embedding");
  if (!config) return null;
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += 32) {
    const batch = texts.slice(offset, offset + 32);
    const started = Date.now();
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, input: batch, ...(config.provider === "openai" && config.dimensions ? { dimensions: config.dimensions } : {}) }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await response.json() as { data?: Array<{ index: number; embedding: number[] }>; usage?: { prompt_tokens?: number; total_tokens?: number }; error?: { message?: string } };
    if (!response.ok || !data.data) throw new Error(data.error?.message || "Embedding 服务返回错误");
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    if (sorted.length !== batch.length || sorted.some((item) => !Array.isArray(item.embedding) || item.embedding.length === 0)) throw new Error("Embedding 服务返回的向量数量不完整");
    if (config.dimensions && sorted.some((item) => item.embedding.length !== config.dimensions)) throw new Error(`Embedding 服务返回维度与配置的 ${config.dimensions} 维不一致`);
    vectors.push(...sorted.map((item) => item.embedding));
    await recordExternalUsage({ tenantId, model: `embedding:${config.model}`, promptTokens: Number(data.usage?.prompt_tokens || data.usage?.total_tokens || Math.ceil(batch.reduce((sum, item) => sum + item.length, 0) / 3)), latencyMs: Date.now() - started }).catch(() => undefined);
  }
  return { vectors, model: config.model, dimensions: vectors[0]?.length ?? 0 };
}

export async function indexDocument(input: {
  tenantId: string; knowledgeBaseId: string; categoryId: string | null; documentId: string; text: string;
}) {
  const runtime = getRuntime(); const chunks = splitIntoChunks(input.text);
  const embedded = await embedTexts(input.tenantId, chunks);
  const now = new Date().toISOString();
  await deleteQdrantDocument(input.tenantId, input.knowledgeBaseId, input.documentId).catch(() => undefined);
  await runtime.DB.prepare("DELETE FROM knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ? AND document_id = ?")
    .bind(input.tenantId, input.knowledgeBaseId, input.documentId).run();
  const document = await runtime.DB.prepare("SELECT name FROM knowledge_documents WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?")
    .bind(input.tenantId, input.knowledgeBaseId, input.documentId).first<{ name: string }>();
  const rows = chunks.map((content, index) => ({ id: crypto.randomUUID(), content, index, vector: embedded?.vectors[index] ?? null }));
  const qdrantStored = embedded && qdrantConfigured() ? await upsertQdrantPoints(rows.flatMap((row) => row.vector ? [{ id: row.id, vector: row.vector, payload: {
    tenant_id: input.tenantId, knowledge_base_id: input.knowledgeBaseId, category_id: input.categoryId,
    document_id: input.documentId, document: document?.name || input.documentId, chunk_index: row.index, text: row.content,
  } }] : [])).catch(() => false) : false;
  for (let offset = 0; offset < chunks.length; offset += 40) {
    const statements = rows.slice(offset, offset + 40).map((row) => {
      const vector = row.vector;
      return runtime.DB.prepare(`INSERT INTO knowledge_chunks
        (id, tenant_id, knowledge_base_id, category_id, document_id, chunk_index, content, token_estimate, embedding_json, embedding_model, vector_dim, vector_store, vector_point_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(row.id, input.tenantId, input.knowledgeBaseId, input.categoryId, input.documentId, row.index, row.content, Math.ceil(row.content.length / 3),
        vector && !qdrantStored ? JSON.stringify(vector) : null, embedded?.model ?? null, vector?.length ?? null, qdrantStored ? "qdrant" : "d1", qdrantStored ? row.id : null, now);
    });
    if (statements.length) await runtime.DB.batch(statements);
  }
  await runtime.DB.prepare("UPDATE knowledge_documents SET index_status = ?, chunk_count = ?, updated_at = ? WHERE tenant_id = ? AND knowledge_base_id = ? AND id = ?")
    .bind(embedded ? "indexed" : "needs_embedding", chunks.length, now, input.tenantId, input.knowledgeBaseId, input.documentId).run();
  return { chunkCount: chunks.length, indexed: Boolean(embedded), model: embedded?.model ?? null };
}

export async function ensureBuiltinChunks(tenantId: string, knowledgeBaseId: string) {
  const runtime = getRuntime();
  const existing = await runtime.DB.prepare("SELECT COUNT(*) AS count, MAX(embedding_model) AS model FROM knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ? AND document_id = ?")
    .bind(tenantId, knowledgeBaseId, BUILTIN_MANUAL.id).first<{ count: number; model: string | null }>();
  if ((existing?.count ?? 0) > 0 && existing?.model) return;
  const chunks = splitIntoChunks(BUILTIN_MANUAL.content);
  const embedded = await embedTexts(tenantId, chunks).catch(() => null);
  if ((existing?.count ?? 0) > 0) {
    if (!embedded) return;
    await deleteQdrantDocument(tenantId, knowledgeBaseId, BUILTIN_MANUAL.id).catch(() => undefined);
    await runtime.DB.prepare("DELETE FROM knowledge_chunks WHERE tenant_id = ? AND knowledge_base_id = ? AND document_id = ?")
      .bind(tenantId, knowledgeBaseId, BUILTIN_MANUAL.id).run();
  }
  const now = new Date().toISOString(); const rows = chunks.map((content, index) => ({ id: crypto.randomUUID(), content, index, vector: embedded?.vectors[index] ?? null }));
  const qdrantStored = embedded && qdrantConfigured() ? await upsertQdrantPoints(rows.flatMap((row) => row.vector ? [{ id: row.id, vector: row.vector, payload: {
    tenant_id: tenantId, knowledge_base_id: knowledgeBaseId, category_id: `cat_default_${knowledgeBaseId}`,
    document_id: BUILTIN_MANUAL.id, document: BUILTIN_MANUAL.name, chunk_index: row.index, text: row.content,
  } }] : [])).catch(() => false) : false;
  await runtime.DB.batch(rows.map((row) => {
    const vector = row.vector;
    return runtime.DB.prepare(`INSERT OR IGNORE INTO knowledge_chunks
      (id, tenant_id, knowledge_base_id, category_id, document_id, chunk_index, content, token_estimate, embedding_json, embedding_model, vector_dim, vector_store, vector_point_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.id, tenantId, knowledgeBaseId, `cat_default_${knowledgeBaseId}`, BUILTIN_MANUAL.id, row.index, row.content, Math.ceil(row.content.length / 3),
      vector && !qdrantStored ? JSON.stringify(vector) : null, embedded?.model ?? null, vector?.length ?? null, qdrantStored ? "qdrant" : "d1", qdrantStored ? row.id : null, now);
  }));
}

async function rerankWithDeepSeek(tenantId: string, question: string, candidates: RetrievalSource[]) {
  const config = await loadProviderConfig(tenantId, "generation");
  if (!config || candidates.length < 2) return candidates;
  const compact = candidates.map((candidate) => ({ id: candidate.chunkId, text: candidate.text.slice(0, 650) }));
  try {
    const started = Date.now();
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, temperature: 0, max_tokens: 700, response_format: { type: "json_object" }, messages: [
        { role: "system", content: "你是检索重排器。根据问题判断每个片段的相关性，输出严格 JSON：{\"scores\":[{\"id\":\"...\",\"score\":0到1}]}。不要回答问题。" },
        { role: "user", content: JSON.stringify({ question, candidates: compact }) },
      ] }), signal: AbortSignal.timeout(30000),
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    if (!response.ok) throw new Error("重排模型请求失败");
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as { scores?: Array<{ id: string; score: number }> };
    await recordExternalUsage({ tenantId, model: `rerank:${config.model}`, promptTokens: Math.ceil((question.length + compact.reduce((sum, item) => sum + item.text.length, 0)) / 3), completionTokens: Math.ceil((data.choices?.[0]?.message?.content?.length || 0) / 3), sourceCount: candidates.length, latencyMs: Date.now() - started }).catch(() => undefined);
    const scores = new Map((parsed.scores || []).map((item) => [item.id, Math.max(0, Math.min(1, Number(item.score))) ]));
    return candidates.map((candidate) => {
      const rerankScore = scores.get(candidate.chunkId) ?? candidate.rerankScore;
      return { ...candidate, rerankScore, confidenceScore: Math.max(rerankScore, candidate.vectorScore * .85 + candidate.lexicalScore * .15) };
    })
      .sort((a, b) => b.rerankScore - a.rerankScore);
  } catch { return candidates; }
}

async function rerankWithSiliconFlow(tenantId: string, config: StoredProviderConfig, question: string, candidates: RetrievalSource[], topN: number) {
  const fallback = candidates.slice(0, topN);
  if (candidates.length < 2) return fallback;
  try {
    const started = Date.now();
    const response = await fetch(`${config.baseUrl}/rerank`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        query: question,
        documents: candidates.map((candidate) => candidate.text),
        return_documents: false,
        top_n: topN,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json() as {
      results?: Array<{ index?: number; relevance_score?: number }>;
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error?.message || data.message || "Rerank 服务返回错误");
    await recordExternalUsage({ tenantId, model: `rerank:${config.model}`, promptTokens: Math.ceil((question.length + candidates.reduce((sum, item) => sum + item.text.length, 0)) / 3), sourceCount: candidates.length, latencyMs: Date.now() - started }).catch(() => undefined);
    const ranked = data.results.flatMap((result) => {
      const index = Number(result.index); const score = Number(result.relevance_score);
      if (!Number.isInteger(index) || index < 0 || index >= candidates.length || !Number.isFinite(score)) return [];
      const rerankScore = Math.max(0, Math.min(1, score)); const candidate = candidates[index];
      return [{ ...candidate, rerankScore, confidenceScore: Math.max(rerankScore, candidate.vectorScore * .85 + candidate.lexicalScore * .15) }];
    });
    return ranked.length ? ranked : fallback;
  } catch {
    // Rerank is an accuracy layer: keep the hybrid vector/lexical order if the provider is unavailable.
    return fallback;
  }
}

export async function retrieveKnowledge(input: { tenantId: string; knowledgeBaseId: string; question: string; topK: number }) {
  const knowledgeBase = await getRuntime().DB.prepare("SELECT is_default FROM knowledge_bases WHERE tenant_id = ? AND id = ? AND status = 'active'")
    .bind(input.tenantId, input.knowledgeBaseId).first<{ is_default: number }>();
  if (!knowledgeBase) return [];
  const builtinApplied = await isBuiltinManualApplied();
  if (knowledgeBase.is_default && builtinApplied) await ensureBuiltinChunks(input.tenantId, input.knowledgeBaseId);
  const queryEmbedding = await embedTexts(input.tenantId, [input.question]).catch(() => null);
  const rerankConfig = await loadProviderConfig(input.tenantId, "rerank").catch(() => null);
  const candidateCount = Math.max(2, Math.min(rerankConfig?.candidateCount ?? 16, 50));
  const queryVector = queryEmbedding?.vectors[0] ?? null;
  let candidates: RetrievalSource[] = [];
  if (queryVector && qdrantConfigured()) {
    const points = await queryQdrant({ tenantId: input.tenantId, knowledgeBaseId: input.knowledgeBaseId, vector: queryVector, limit: candidateCount }).catch(() => null);
    if (points?.length) candidates = points.flatMap((point) => {
      const payload = point.payload || {}; const documentId = String(payload.document_id || ""); const text = typeof payload.text === "string" ? payload.text : "";
      if (!text || (!builtinApplied && documentId === BUILTIN_MANUAL.id)) return [];
      const vectorScore = Math.max(0, Math.min(1, (Number(point.score) + 1) / 2)); const lexical = lexicalScore(input.question, text); const rerankScore = vectorScore * .78 + lexical * .22;
      return [{ documentId, document: String(payload.document || payload.document_id || "知识文档"), chunkId: String(point.id), text,
        vectorScore, lexicalScore: lexical, rerankScore, confidenceScore: Math.max(rerankScore, vectorScore * .85 + lexical * .15) }];
    });
  }
  if (!candidates.length) {
    const result = await getRuntime().DB.prepare(`
      SELECT c.id, c.document_id, c.content, c.embedding_json, c.chunk_index,
        COALESCE(d.name, ?) AS document_name
      FROM knowledge_chunks c LEFT JOIN knowledge_documents d ON d.id = c.document_id AND d.tenant_id = c.tenant_id AND d.knowledge_base_id = c.knowledge_base_id
      WHERE c.tenant_id = ? AND c.knowledge_base_id = ? ${builtinApplied ? "" : "AND c.document_id != ?"} LIMIT 2500
    `).bind(...(builtinApplied ? [BUILTIN_MANUAL.name, input.tenantId, input.knowledgeBaseId] : [BUILTIN_MANUAL.name, input.tenantId, input.knowledgeBaseId, BUILTIN_MANUAL.id])).all();
    candidates = (result.results as Array<{ id: string; document_id: string; content: string; embedding_json: string | null; chunk_index: number; document_name: string }>).map((row) => {
      const vector = row.embedding_json ? JSON.parse(row.embedding_json) as number[] : null;
      const vectorScore = queryVector && vector ? (cosine(queryVector, vector) + 1) / 2 : 0;
      const lexical = lexicalScore(input.question, row.content); const rerankScore = vector ? vectorScore * .78 + lexical * .22 : lexical;
      return { documentId: row.document_id, document: row.document_name, chunkId: row.id, text: row.content, vectorScore, lexicalScore: lexical, rerankScore, confidenceScore: Math.max(rerankScore, vectorScore * .85 + lexical * .15) };
    }).sort((a, b) => b.rerankScore - a.rerankScore).slice(0, candidateCount);
  }
  const requestedTopK = Math.max(1, Math.min(input.topK, 8));
  if (rerankConfig) {
    const finalCount = Math.max(1, Math.min(rerankConfig.topN ?? 3, requestedTopK, candidates.length || 1));
    return rerankWithSiliconFlow(input.tenantId, rerankConfig, input.question, candidates, finalCount);
  }
  candidates = await rerankWithDeepSeek(input.tenantId, input.question, candidates);
  return candidates.slice(0, requestedTopK);
}

function responseOutputText(data: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  if (data.output_text) return data.output_text;
  return (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("\n");
}

async function parseWithOpenAI(config: StoredProviderConfig, file: File) {
  const form = new FormData(); form.append("purpose", "user_data"); form.append("file", file, file.name);
  const uploaded = await fetch(`${config.baseUrl}/files`, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(60000) });
  const uploadData = await uploaded.json() as { id?: string; error?: { message?: string } };
  if (!uploaded.ok || !uploadData.id) throw new Error(uploadData.error?.message || "OCR 文件上传失败");
  try {
    const response = await fetch(`${config.baseUrl}/responses`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model || "gpt-4.1-mini", input: [{ role: "user", content: [
        { type: "input_file", file_id: uploadData.id },
        { type: "input_text", text: "请提取这份资料中的全部可见文字。用 Markdown 保留标题、段落、列表和表格的阅读顺序；只输出提取结果，不要解释。" },
      ] }] }), signal: AbortSignal.timeout(120000),
    });
    const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "OCR 识别失败");
    const text = responseOutputText(data).trim();
    return { text, pageCount: null, engine: `openai:${config.model}` };
  } finally {
    await fetch(`${config.baseUrl}/files/${uploadData.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${config.apiKey}` } }).catch(() => undefined);
  }
}

async function parseWithDocling(config: StoredProviderConfig, file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch(`${config.baseUrl}/v1/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(180000),
  });
  let data: { text?: string; markdown?: string; pageCount?: number | null; page_count?: number | null; engine?: string; error?: string; detail?: string } = {};
  try {
    data = await response.json() as typeof data;
  } catch {
    // A non-JSON upstream error is converted into a stable application error below.
  }
  if (!response.ok) throw new Error(data.error || data.detail || `Docling 服务返回 HTTP ${response.status}`);
  const text = (data.markdown || data.text || "").trim();
  if (!text) throw new Error("Docling 没有提取到可用文字");
  return { text, pageCount: data.pageCount ?? data.page_count ?? null, engine: data.engine || "docling+rapidocr" };
}

export async function parseDocumentWithConfiguredOcr(tenantId: string, file: File, requestedMode: "auto" | "text" | "table" = "auto") {
  const config = await loadProviderConfig(tenantId, "ocr");
  if (!config) return null;
  const mode = requestedMode === "auto"
    ? (/表格|报表|清单|台账|table|sheet|ledger/i.test(file.name) ? "table" : "text")
    : requestedMode;
  if (config.provider === "docling") return parseWithDocling(config, file);
  if (config.provider === "openai") return parseWithOpenAI(config, file);
  if (config.provider === "baidu") return parseWithBaiduOcr(config, file, mode);
  if (config.provider === "tencent") return parseWithTencentOcr(config, file, mode);
  if (config.provider === "compatible") return parseWithDocling(config, file);
  throw new Error("当前 OCR 服务商不受支持");
}
