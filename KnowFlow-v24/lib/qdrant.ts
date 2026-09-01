import { getRuntime } from "./runtime";

type QdrantPoint = { id: string; vector: number[]; payload: Record<string, unknown> };

function config() {
  const runtime = getRuntime(); if (!runtime.QDRANT_URL) return null;
  const url = new URL(runtime.QDRANT_URL); const local = runtime.APP_ENV === "local";
  if ((!local && url.protocol !== "https:") || (local && !["http:", "https:"].includes(url.protocol))) return null;
  const collection = (runtime.QDRANT_COLLECTION || "knowflow_chunks").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  const vectorSize = Number(runtime.QDRANT_VECTOR_SIZE || 0);
  return { baseUrl: url.toString().replace(/\/$/, ""), apiKey: runtime.QDRANT_API_KEY || "", collection, vectorSize: Number.isInteger(vectorSize) && vectorSize > 0 ? vectorSize : null };
}

function headers(apiKey: string) { return { "Content-Type": "application/json", ...(apiKey ? { "api-key": apiKey } : {}) }; }

async function request(path: string, init: RequestInit) {
  const current = config(); if (!current) throw new Error("Qdrant 未配置");
  const response = await fetch(`${current.baseUrl}${path}`, { ...init, headers: { ...headers(current.apiKey), ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Qdrant HTTP ${response.status}: ${String(data.status || data.result || "request failed")}`);
  return data;
}

export function qdrantConfigured() { return Boolean(config()); }

export async function ensureQdrantCollection(dimensions: number) {
  const current = config(); if (!current) return false;
  if (current.vectorSize && current.vectorSize !== dimensions) throw new Error(`Qdrant configured dimension ${current.vectorSize} does not match embedding dimension ${dimensions}`);
  const exists = await fetch(`${current.baseUrl}/collections/${current.collection}`, { headers: headers(current.apiKey), signal: AbortSignal.timeout(8000) });
  if (exists.status === 404) {
    await request(`/collections/${current.collection}`, { method: "PUT", body: JSON.stringify({ vectors: { size: dimensions, distance: "Cosine" }, on_disk_payload: true }) });
    for (const fieldName of ["tenant_id", "knowledge_base_id", "document_id"]) {
      await request(`/collections/${current.collection}/index?wait=true`, { method: "PUT", body: JSON.stringify({ field_name: fieldName, field_schema: "keyword" }) }).catch(() => undefined);
    }
    return true;
  }
  if (!exists.ok) throw new Error(`Qdrant collection check failed: HTTP ${exists.status}`);
  const data = await exists.json() as { result?: { config?: { params?: { vectors?: { size?: number } } } } };
  const size = Number(data.result?.config?.params?.vectors?.size || 0);
  if (size && size !== dimensions) throw new Error(`Qdrant collection dimension ${size} does not match embedding dimension ${dimensions}`);
  return true;
}

export async function upsertQdrantPoints(points: QdrantPoint[]) {
  const current = config(); if (!current || !points.length) return false;
  await ensureQdrantCollection(points[0].vector.length);
  for (let offset = 0; offset < points.length; offset += 64) {
    await request(`/collections/${current.collection}/points?wait=true`, { method: "PUT", body: JSON.stringify({ points: points.slice(offset, offset + 64) }) });
  }
  return true;
}

export async function deleteQdrantDocument(tenantId: string, knowledgeBaseId: string, documentId: string) {
  const current = config(); if (!current) return false;
  await request(`/collections/${current.collection}/points/delete?wait=true`, { method: "POST", body: JSON.stringify({ filter: { must: [
    { key: "tenant_id", match: { value: tenantId } }, { key: "knowledge_base_id", match: { value: knowledgeBaseId } }, { key: "document_id", match: { value: documentId } },
  ] } }) }).catch((error) => { if (!String(error).includes("404")) throw error; });
  return true;
}

export async function queryQdrant(input: { tenantId: string; knowledgeBaseId: string; vector: number[]; limit: number }) {
  const current = config(); if (!current) return null;
  const data = await request(`/collections/${current.collection}/points/query`, { method: "POST", body: JSON.stringify({ query: input.vector, filter: { must: [
    { key: "tenant_id", match: { value: input.tenantId } }, { key: "knowledge_base_id", match: { value: input.knowledgeBaseId } },
  ] }, limit: input.limit, with_payload: true, with_vector: false }) }) as { result?: { points?: Array<{ id: string; score: number; payload?: Record<string, unknown> }> } };
  return data.result?.points || [];
}

export async function exportQdrantVectors(pointIds: string[]) {
  const current = config(); const vectors = new Map<string, number[]>(); if (!current || !pointIds.length) return vectors;
  for (let offset = 0; offset < pointIds.length; offset += 100) {
    const data = await request(`/collections/${current.collection}/points`, { method: "POST", body: JSON.stringify({ ids: pointIds.slice(offset, offset + 100), with_payload: false, with_vector: true }) }) as { result?: Array<{ id: string | number; vector?: number[] | Record<string, number[]> }> };
    for (const point of data.result || []) {
      const vector = Array.isArray(point.vector) ? point.vector : point.vector && typeof point.vector === "object" ? Object.values(point.vector)[0] : null;
      if (Array.isArray(vector) && vector.every((item) => typeof item === "number")) vectors.set(String(point.id), vector);
    }
  }
  return vectors;
}

export async function qdrantHealth() {
  const current = config(); if (!current) return { configured: false, ready: false, collection: null };
  const started = Date.now();
  try { const response = await fetch(`${current.baseUrl}/collections/${current.collection}`, { headers: headers(current.apiKey), signal: AbortSignal.timeout(8000) });
    return { configured: true, ready: response.ok || response.status === 404, collection: current.collection, latencyMs: Date.now() - started, status: response.status };
  } catch (error) { return { configured: true, ready: false, collection: current.collection, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "连接失败" }; }
}
