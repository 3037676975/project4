"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useState } from "react";
import CommercialPanel from "./commercial-panel";
import QualitySuite from "./quality-suite";
import OperationsPanel from "./operations-panel";
import OnboardingWizard from "./onboarding-wizard";
import PaymentCheckoutModal from "./payment-checkout-modal";

type ProviderKind = "generation" | "embedding" | "rerank" | "ocr";
type ProviderConfig = {
  kind: ProviderKind; provider: string; baseUrl: string; model: string; secondaryModel: string | null;
  dimensions: number | null; configured: boolean; keyHint: string | null; credentialIdHint?: string | null;
  region?: string | null; updatedAt: string | null; requiresReindex?: boolean; reuseEmbeddingKey?: boolean;
  candidateCount?: number | null; topN?: number | null;
};
type KnowledgeDocument = {
  id: string; categoryId: string | null; position: number; name: string; mimeType: string; charCount: number;
  pageCount?: number | null; status: string; indexStatus: string; chunkCount: number; ocrUsed: boolean;
  createdAt: string; builtIn: boolean;
};
type KnowledgeBase = {
  id: string; name: string; description: string; isDefault: boolean; position: number; documentCount: number;
  categoryCount: number; assistantCount: number; createdAt: string;
};
type KnowledgeCategory = { id: string; name: string; position: number; isSystem: boolean; documentCount: number; createdAt: string };
type Assistant = {
  id: string; name: string; modelAlias: string; knowledgeBaseId: string; systemPrompt: string; temperature: number;
  topK: number; qualityThreshold: number; fallbackMessage: string; version: number; updatedAt: string | null;
};
type Source = { documentId: string; document: string; chunkId: string; score: number; confidenceScore: number; vectorScore: number; lexicalScore: number; excerpt: string };
type ChatResult = { answer?: string; error?: string; model?: string; modelAlias?: string; latency_ms?: number; traceId?: string; credits?: number; grounded?: boolean; qualityScore?: number; threshold?: number; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; sources?: Source[] };
type Usage = { summary: { requests: number; totalTokens: number; avgLatencyMs: number; successes: number; fallbacks: number; creditsUsed: number; costMicros: number; costCents: number; creditsBalance: number }; recent: Array<{ id: string; requestId: string; model: string; totalTokens: number; latencyMs: number; sourceCount: number; credits: number; costMicros: number; status: string; createdAt: string }>; traces: Array<{ id: string; requestId: string; model: string; question: string; totalTokens: number; latencyMs: number; credits: number; costMicros: number; grounded: boolean; qualityScore: number; status: string; createdAt: string }> };
type TenantData = { tenant: { id: string; name: string; slug: string; status: string; creditsBalance: number; companyName: string; billingEmail: string; privacyRetentionDays: number; onboardingCompleted: boolean; createdAt: string }; currentUser: { email: string; displayName: string; role: string; platformPreview?: boolean }; workspaces: Array<{ id: string; name: string; slug: string; role: string }>; invitations: Array<{ id: string; email: string; role: string; expiresAt: string }>; members: Array<{ id: string; accountId?: string | null; email: string; displayName: string; role: string; status: string; mustChangePassword?: boolean; lastLoginAt?: string | null; createdAt: string }> };
type Plan = { id: string; code: string; name: string; monthlyPriceCents: number; requestQuota: number; tokenQuota: number; storageQuotaBytes: number; monthlyCredits: number; apiKeyLimit: number; memberLimit: number; widgetConversationQuota: number; leadQuota: number; features: string[] };
type BillingOrder = { id: string; orderNo: string; status: string; amountCents: number; provider: string; paymentUrl: string | null; expiresAt: string; createdAt: string; plan?: { code: string; name: string } };
type PaymentChannel = { provider: string; name: string; mode: string; ready: boolean; sortOrder: number; feeRateBps: number; fixedFeeCents: number; minAmountCents: number; maxAmountCents: number };
type Billing = { payment: { mode: string; provider: string; ready: boolean; callbackHttpsReady?: boolean; channels: PaymentChannel[] }; orders: BillingOrder[]; refunds: Array<{ id: string; orderNo: string; amountCents: number; status: string }>; plans: Plan[]; subscription: { id: string; plan: { id: string; code: string; name: string }; status: string; source: string; expiresAt?: string | null } | null; usage: { month: string; requests: number; tokens: number; creditsUsed: number; apiKeys: number; members: number; storageBytes: number; creditsBalance: number } };
type ApiKeyItem = { id: string; name: string; prefix: string; modelAlias: string | null; scopes: string[]; rpmLimit: number; tpmLimit: number; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null; createdAt: string };

const initialGeneration: ProviderConfig = { kind: "generation", provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", secondaryModel: null, dimensions: null, configured: false, keyHint: null, updatedAt: null };
const initialEmbedding: ProviderConfig = { kind: "embedding", provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-m3", secondaryModel: null, dimensions: 1024, configured: false, keyHint: null, updatedAt: null };
const initialRerank: ProviderConfig = { kind: "rerank", provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-reranker-v2-m3", secondaryModel: null, dimensions: null, configured: false, keyHint: null, updatedAt: null, reuseEmbeddingKey: true, candidateCount: 12, topN: 3 };
const initialOcr: ProviderConfig = { kind: "ocr", provider: "docling", baseUrl: "https://parser.example.com", model: "rapidocr", secondaryModel: null, dimensions: null, configured: false, keyHint: null, credentialIdHint: null, region: null, updatedAt: null };
const initialAssistant: Assistant = { id: "", name: "知识库客服", modelAlias: "kb-architect-v1", knowledgeBaseId: "", systemPrompt: "你是企业知识库客服。严格依据检索到的资料回答；资料不足时明确说明；结论优先，并标注使用的知识来源。", temperature: .2, topK: 5, qualityThreshold: .62, fallbackMessage: "当前资料不足以可靠回答这个问题。您可以换一种说法，或点击转人工服务。", version: 1, updatedAt: null };
const initialUsage: Usage = { summary: { requests: 0, totalTokens: 0, avgLatencyMs: 0, successes: 0, fallbacks: 0, creditsUsed: 0, costMicros: 0, costCents: 0, creditsBalance: 0 }, recent: [], traces: [] };
type NavLabel = "概览" | "知识库" | "助手" | "质量测试" | "客服运营" | "成员与权限" | "套餐与账单" | "API 密钥" | "用量与成本" | "渠道与合规";
const navGroups: Array<{ group: string; items: Array<[NavLabel, string]> }> = [
  { group: "日常工作", items: [["概览", "01"], ["知识库", "02"], ["助手", "03"], ["质量测试", "04"], ["客服运营", "05"]] },
  { group: "企业设置", items: [["成员与权限", "06"], ["套餐与账单", "07"], ["API 密钥", "08"], ["用量与成本", "09"], ["渠道与合规", "10"]] },
];
const scopeOptions = ["models", "chat:completions", "responses", "embeddings", "traces"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers); if (typeof window !== "undefined") { const tenantId = localStorage.getItem("knowflow_tenant_id"); if (tenantId) headers.set("x-tenant-id", tenantId); }
  const response = await fetch(url, { ...init, headers }); const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
function count(value: number) { return new Intl.NumberFormat("zh-CN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0); }
function date(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; }
function bytes(value: number) { if (value >= 1073741824) return `${(value / 1073741824).toFixed(1)} GB`; if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`; return `${Math.round(value / 1024)} KB`; }
function documentBadge(item: KnowledgeDocument) { const suffix = item.name.toLowerCase().split(".").pop() || "txt"; const labels: Record<string, string> = { docx: "DOC", xlsx: "XLS", pptx: "PPT", pdf: "PDF" }; return labels[suffix] || (item.mimeType.startsWith("image/") ? "IMG" : "TXT"); }

export default function Dashboard({ user, isPlatformAdmin, initialTenantId, logoutHref }: { user: { displayName: string; email: string }; isPlatformAdmin: boolean; initialTenantId?: string; logoutHref: string }) {
  const [active, setActive] = useState<NavLabel>("概览");
  const [generation, setGeneration] = useState(initialGeneration); const [embedding, setEmbedding] = useState(initialEmbedding);
  const [rerank, setRerank] = useState(initialRerank); const [ocr, setOcr] = useState(initialOcr);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]); const [activeKnowledgeBaseId, setActiveKnowledgeBaseId] = useState("");
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]); const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [uploadCategoryId, setUploadCategoryId] = useState(""); const [ocrMode, setOcrMode] = useState<"auto" | "text" | "table">("auto"); const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [assistant, setAssistant] = useState(initialAssistant); const [usage, setUsage] = useState(initialUsage);
  const [tenant, setTenant] = useState<TenantData | null>(null); const [billing, setBilling] = useState<Billing | null>(null); const [paymentProvider, setPaymentProvider] = useState(""); const [checkoutOrder, setCheckoutOrder] = useState<BillingOrder | null>(null); const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null); const [file, setFile] = useState<File | null>(null); const [pasteName, setPasteName] = useState(""); const [pasteText, setPasteText] = useState("");
  const [question, setQuestion] = useState("这个方案如何实现多租户隔离和真正的 RAG？"); const [result, setResult] = useState<ChatResult | null>(null);
  const [qualityKnowledgeBaseId, setQualityKnowledgeBaseId] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [platformAccess, setPlatformAccess] = useState(isPlatformAdmin);
  const [keyForm, setKeyForm] = useState({ name: "生产环境", rpmLimit: 60, tpmLimit: 100000, scopes: scopeOptions }); const [memberForm, setMemberForm] = useState({ displayName: "", email: "", temporaryPassword: "", role: "member" });

  useLayoutEffect(() => {
    if (initialTenantId) localStorage.setItem("knowflow_tenant_id", initialTenantId);
  }, [initialTenantId]);

  const loadKnowledge = useCallback(async (knowledgeBaseId: string) => {
    const [docs, categoryData] = await Promise.all([
      api<{ knowledgeBase: { id: string; name: string }; documents: KnowledgeDocument[] }>(`/api/knowledge?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`),
      api<{ categories: KnowledgeCategory[] }>(`/api/knowledge-categories?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`),
    ]);
    setActiveKnowledgeBaseId(docs.knowledgeBase.id); setDocuments(docs.documents); setCategories(categoryData.categories);
    setUploadCategoryId((current) => categoryData.categories.some((item) => item.id === current) ? current : (categoryData.categories.find((item) => item.isSystem)?.id || categoryData.categories[0]?.id || ""));
  }, []);

  const loadAll = useCallback(async () => {
    const [settings, basesData, asst, stats, tenantData, billingData, keysData] = await Promise.all([
      api<{ generation: ProviderConfig; embedding: ProviderConfig; rerank: ProviderConfig; ocr: ProviderConfig }>("/api/settings"),
      api<{ activeKnowledgeBaseId: string; knowledgeBases: KnowledgeBase[] }>("/api/knowledge-bases"),
      api<Assistant>("/api/assistant"), api<Usage>("/api/usage"), api<TenantData>("/api/tenant"), api<Billing>("/api/billing"), api<{ keys: ApiKeyItem[] }>("/api/api-keys"),
    ]);
    setGeneration(settings.generation); setEmbedding(settings.embedding); setRerank(settings.rerank); setOcr(settings.ocr);
    setKnowledgeBases(basesData.knowledgeBases); setAssistant(asst); setUsage(stats); setTenant(tenantData); setBilling(billingData); setApiKeys(keysData.keys);
    setQualityKnowledgeBaseId((current) => basesData.knowledgeBases.some((item) => item.id === current) ? current : (asst.knowledgeBaseId || basesData.activeKnowledgeBaseId));
    if (!tenantData.tenant.onboardingCompleted && ["owner", "admin"].includes(tenantData.currentUser.role)) setShowOnboarding(true);
    setPaymentProvider((current) => billingData.payment.channels.some((item) => item.ready && item.provider === current) ? current : (billingData.payment.channels.find((item) => item.ready)?.provider || billingData.payment.provider));
    await loadKnowledge(basesData.activeKnowledgeBaseId);
  }, [loadKnowledge]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll().catch((error) => setToast({ kind: "error", text: error instanceof Error ? error.message : "数据加载失败" })); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);
  useEffect(() => { const timer = window.setTimeout(() => { void api<{ allowed: boolean }>("/api/platform/access").then((result) => setPlatformAccess(result.allowed)).catch(() => setPlatformAccess(false)); }, 0); return () => window.clearTimeout(timer); }, []);

  const canAdmin = tenant?.currentUser.role === "owner" || tenant?.currentUser.role === "admin";
  const indexedDocs = documents.filter((item) => item.indexStatus === "indexed").length;
  const activePlan = billing?.plans.find((item) => item.code === billing.subscription?.plan.code);
  const activeBase = knowledgeBases.find((item) => item.id === activeKnowledgeBaseId);
  const assistantBase = knowledgeBases.find((item) => item.id === assistant.knowledgeBaseId);
  const knowledgeReadyRate = documents.length ? Math.round(indexedDocs / documents.length * 100) : 0;
  const modelReadyCount = [generation, embedding, rerank, ocr].filter((item) => item.configured).length;
  const modelReadyRate = Math.round(modelReadyCount / 4 * 100);
  const requestRate = activePlan?.requestQuota ? Math.min(100, Math.round((billing?.usage.requests || 0) / activePlan.requestQuota * 100)) : 0;
  const onboardingReadyRate = tenant?.tenant.onboardingCompleted ? 100 : 55;
  const healthScore = Math.round((onboardingReadyRate + (documents.length ? knowledgeReadyRate : 35) + modelReadyRate + (usage.summary.creditsBalance > 0 ? 100 : 45)) / 4);
  const recentTraceBars = usage.traces.slice(0, 8).reverse();
  const maxTraceTokens = Math.max(1, ...recentTraceBars.map((item) => item.totalTokens));
  const enterpriseName = tenant?.tenant.companyName?.trim() || tenant?.tenant.name?.trim() || "企业工作台";
  const enterpriseInitial = enterpriseName.slice(0, 1).toUpperCase();
  const endpoint = `${typeof window === "undefined" ? "https://your-site.example" : window.location.origin}/v1`;
  const commercialNotice = useCallback((notice: { kind: "ok" | "error"; text: string }) => setToast(notice), []);

  async function finishOnboarding(result: { demo: { indexStatus: string }; widget: { published: boolean }; warning?: string | null }) {
    setShowOnboarding(false); await loadAll(); setActive("客服运营");
    setToast({ kind: result.warning ? "error" : "ok", text: result.warning || `企业开通完成：演示知识${result.demo.indexStatus === "indexed" ? "已向量化" : "已建立"}，官网客服${result.widget.published ? "已发布" : "已保存待发布"}。` });
  }

  async function refreshBases() {
    const data = await api<{ activeKnowledgeBaseId: string; knowledgeBases: KnowledgeBase[] }>("/api/knowledge-bases");
    setKnowledgeBases(data.knowledgeBases); return data;
  }

  async function selectKnowledgeBase(id: string) {
    if (!id || id === activeKnowledgeBaseId) return;
    setBusy("select-kb"); setResult(null);
    try {
      await api("/api/knowledge-bases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "select" }) });
      await loadKnowledge(id); setToast({ kind: "ok", text: "已切换当前知识库，分类和文档已隔离加载。" });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "切换失败" }); } finally { setBusy(null); }
  }

  async function createKnowledgeBase() {
    const name = prompt("新知识库名称，例如：售后政策库"); if (!name?.trim()) return;
    setBusy("create-kb");
    try {
      const created = await api<KnowledgeBase>("/api/knowledge-bases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), description: "租户独立知识空间" }) });
      await refreshBases(); await selectKnowledgeBase(created.id); setToast({ kind: "ok", text: `知识库“${created.name}”已创建。` });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "创建失败" }); } finally { setBusy(null); }
  }

  async function renameKnowledgeBase() {
    if (!activeBase) return; const name = prompt("修改知识库名称", activeBase.name); if (!name?.trim() || name.trim() === activeBase.name) return;
    try {
      await api("/api/knowledge-bases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeBase.id, name: name.trim(), description: activeBase.description }) });
      await refreshBases(); setToast({ kind: "ok", text: "知识库名称已修改。" });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "修改失败" }); }
  }

  async function deleteKnowledgeBase() {
    if (!activeBase || activeBase.isDefault || !confirm(`确认删除空知识库“${activeBase.name}”？`)) return;
    try {
      await api(`/api/knowledge-bases?id=${encodeURIComponent(activeBase.id)}`, { method: "DELETE" });
      const data = await refreshBases(); await loadKnowledge(data.activeKnowledgeBaseId); setToast({ kind: "ok", text: "知识库已删除。" });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "删除失败" }); }
  }

  async function createCategory() {
    const name = prompt("新分类名称，例如：产品手册"); if (!name?.trim() || !activeKnowledgeBaseId) return;
    try {
      await api("/api/knowledge-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledgeBaseId: activeKnowledgeBaseId, name: name.trim() }) });
      await loadKnowledge(activeKnowledgeBaseId); setToast({ kind: "ok", text: `分类“${name.trim()}”已创建，可把文档拖进去。` });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "创建失败" }); }
  }

  async function renameCategory(category: KnowledgeCategory) {
    const name = prompt("修改分类名称", category.name); if (!name?.trim() || name.trim() === category.name) return;
    try {
      await api("/api/knowledge-categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledgeBaseId: activeKnowledgeBaseId, id: category.id, name: name.trim() }) });
      await loadKnowledge(activeKnowledgeBaseId); setToast({ kind: "ok", text: "分类名称已修改。" });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "修改失败" }); }
  }

  async function deleteCategory(category: KnowledgeCategory) {
    if (category.isSystem || !confirm(`删除分类“${category.name}”？其中的文档会移到“未分类”。`)) return;
    try {
      const data = await api<{ movedDocuments: number }>(`/api/knowledge-categories?knowledgeBaseId=${encodeURIComponent(activeKnowledgeBaseId)}&id=${encodeURIComponent(category.id)}`, { method: "DELETE" });
      await loadKnowledge(activeKnowledgeBaseId); setToast({ kind: "ok", text: `分类已删除，${data.movedDocuments} 份文档已移到“未分类”。` });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "删除失败" }); }
  }

  async function moveDocument(documentId: string, categoryId: string) {
    if (!documentId || !categoryId) return;
    setBusy(`move-${documentId}`);
    try {
      await api("/api/knowledge/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledgeBaseId: activeKnowledgeBaseId, documentId, categoryId }) });
      await loadKnowledge(activeKnowledgeBaseId); setToast({ kind: "ok", text: "文档已移动，原向量索引继续有效。" });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "移动失败" }); } finally { setBusy(null); setDraggedDocumentId(null); }
  }

  function onCategoryDrop(event: DragEvent, categoryId: string) {
    event.preventDefault(); const documentId = event.dataTransfer.getData("text/plain") || draggedDocumentId;
    if (documentId) void moveDocument(documentId, categoryId);
  }

  async function uploadKnowledge(event: FormEvent) {
    event.preventDefault(); setBusy("upload"); setToast(null);
    try {
      const form = new FormData(); if (file) form.append("file", file); if (pasteText.trim()) form.append("text", pasteText.trim()); if (pasteName.trim()) form.append("name", pasteName.trim());
      form.append("knowledgeBaseId", activeKnowledgeBaseId); form.append("categoryId", uploadCategoryId); form.append("recognitionMode", ocrMode);
      const data = await api<{ document: KnowledgeDocument; warning?: string }>("/api/knowledge", { method: "POST", body: form });
      setFile(null); setPasteName(""); setPasteText(""); const input = document.querySelector<HTMLInputElement>("#knowledge-file"); if (input) input.value = "";
      await loadKnowledge(activeKnowledgeBaseId); await refreshBases();
      setToast({ kind: data.warning ? "error" : "ok", text: data.warning || `“${data.document.name}”已完成解析、切片与向量索引。` });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "导入失败" }); } finally { setBusy(null); }
  }

  async function reindex(id?: string) {
    setBusy(`index-${id || "all"}`);
    try {
      await api("/api/knowledge/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(id ? { id } : {}), knowledgeBaseId: activeKnowledgeBaseId }) });
      await loadKnowledge(activeKnowledgeBaseId); setToast({ kind: "ok", text: id ? "文档已重新向量化。" : "当前知识库已全部重新向量化。" });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "索引失败" }); } finally { setBusy(null); }
  }

  async function removeDocument(item: KnowledgeDocument) {
    if (item.builtIn || !confirm(`确认删除“${item.name}”？`)) return;
    setBusy(`delete-${item.id}`);
    try {
      await api(`/api/knowledge?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }); await loadKnowledge(activeKnowledgeBaseId); await refreshBases();
      setToast({ kind: "ok", text: "文档、原文件与向量分块已删除。" });
    } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "删除失败" }); } finally { setBusy(null); }
  }

  async function saveAssistant(event: FormEvent) {
    event.preventDefault(); setBusy("assistant");
    try { const data = await api<Assistant>("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assistant) }); setAssistant(data); await refreshBases(); setToast({ kind: "ok", text: `助手 v${data.version} 已绑定“${knowledgeBases.find((item) => item.id === data.knowledgeBaseId)?.name || "知识库"}”。` }); }
    catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); } finally { setBusy(null); }
  }

  async function runTest(event: FormEvent) { event.preventDefault(); if (!question.trim()) return; setBusy("chat"); setResult(null); try { const data = await api<ChatResult>("/api/deepseek", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, knowledgeBaseId: qualityKnowledgeBaseId || assistant.knowledgeBaseId }) }); setResult(data); setUsage(await api<Usage>("/api/usage")); } catch (error) { setResult({ error: error instanceof Error ? error.message : "调用失败" }); } finally { setBusy(null); } }
  async function createApiKey(event: FormEvent) { event.preventDefault(); setBusy("key"); try { const data = await api<{ key: ApiKeyItem & { value: string } }>("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(keyForm) }); setCreatedKey(data.key.value); setApiKeys((current) => [data.key, ...current]); setToast({ kind: "ok", text: "客户 API Key 已生成，仅本次显示完整值。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "创建失败" }); } finally { setBusy(null); } }
  async function revokeKey(id: string) { if (!confirm("吊销后客户端将立即无法调用，确认继续？")) return; try { await api(`/api/api-keys?id=${id}`, { method: "DELETE" }); setApiKeys((current) => current.map((item) => item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item)); setToast({ kind: "ok", text: "API Key 已吊销。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "吊销失败" }); } }
  async function createMember(event: FormEvent) { event.preventDefault(); setBusy("member"); try { const result = await api<{ accountCreated: boolean }>("/api/tenant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "member_create", ...memberForm }) }); setMemberForm({ displayName: "", email: "", temporaryPassword: "", role: "member" }); setTenant(await api<TenantData>("/api/tenant")); setToast({ kind: "ok", text: result.accountCreated ? "成员账号已创建；请把临时密码单独交给成员，首次登录必须改密。" : "已有账号已加入当前企业，不会覆盖其原密码。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "创建失败" }); } finally { setBusy(null); } }
  async function selectPlan(code: string) { if (!confirm("系统将创建待支付订单。只有支付验签成功后套餐才会生效，继续？")) return; setBusy(`plan-${code}`); try { const data = await api<{ order: BillingOrder }>("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_order", planCode: code, provider: paymentProvider || billing?.payment.provider, clientRequestId: crypto.randomUUID() }) }); if (data.order.provider === "sandbox") { if (confirm(`本地沙箱订单 ${data.order.orderNo} 已创建。现在模拟付款并验证幂等开通？`)) await api("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sandbox_confirm", orderNo: data.order.orderNo }) }); } else if (data.order.paymentUrl) setCheckoutOrder(data.order); setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: data.order.provider === "sandbox" ? "沙箱付款完成，套餐已由订单履约程序开通。" : "订单已创建，请扫描二维码完成付款。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "下单失败" }); } finally { setBusy(null); } }
  async function paymentCompleted() { setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: "支付已确认，套餐和 Credits 已自动开通。" }); }
  async function switchWorkspace(id: string) { if (!id || id === tenant?.tenant.id) return; localStorage.setItem("knowflow_tenant_id", id); setBusy("workspace"); try { await loadAll(); setResult(null); setToast({ kind: "ok", text: "已切换企业工作区，后续请求强制绑定该租户。" }); } catch (error) { localStorage.removeItem("knowflow_tenant_id"); setToast({ kind: "error", text: error instanceof Error ? error.message : "切换失败" }); } finally { setBusy(null); } }
  async function removeMember(id: string) { if (!confirm("禁用后该成员将立即失去企业工作区访问权限，继续？")) return; try { await api(`/api/tenant?id=${encodeURIComponent(id)}`, { method: "DELETE" }); setTenant(await api<TenantData>("/api/tenant")); setToast({ kind: "ok", text: "成员已禁用。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "禁用失败" }); } }
  async function updateMemberRole(id: string, role: string) { try { await api("/api/tenant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "member_role", memberId: id, role }) }); setTenant(await api<TenantData>("/api/tenant")); setToast({ kind: "ok", text: "成员角色已更新。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "角色更新失败" }); } }
  async function resetMemberPassword(id: string) { const temporaryPassword = prompt("输入新的临时密码（至少10位，包含字母和数字）。成员下次登录必须修改："); if (!temporaryPassword) return; try { await api("/api/tenant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "member_password_reset", memberId: id, temporaryPassword }) }); setTenant(await api<TenantData>("/api/tenant")); setToast({ kind: "ok", text: "临时密码已重置，该成员的旧会话已全部退出。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "重置失败" }); } }
  async function requestRefund(orderNo: string) { const reason = prompt("请填写退款原因（退款成功后会撤销对应 Credits；若没有后续续费，套餐降为免费版）", "不再使用"); if (!reason?.trim()) return; setBusy(`refund-${orderNo}`); try { await api("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request_refund", orderNo, reason }) }); setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: billing?.payment.mode === "sandbox" ? "沙箱退款已完成。" : "退款申请已提交，状态会以支付渠道回调为准。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "退款申请失败" }); } finally { setBusy(null); } }
  async function completeOnboarding() { const companyName = prompt("企业名称", tenant?.tenant.companyName || tenant?.tenant.name || ""); if (!companyName?.trim()) return; const billingEmail = prompt("账单与合规联系邮箱", tenant?.tenant.billingEmail || tenant?.currentUser.email || ""); if (!billingEmail?.trim()) return; try { await api("/api/tenant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "onboarding", companyName, billingEmail, privacyRetentionDays: tenant?.tenant.privacyRetentionDays || 180 }) }); setTenant(await api<TenantData>("/api/tenant")); setToast({ kind: "ok", text: "企业资料和数据保存期限已设置。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); } }
  async function copy(value: string) { await navigator.clipboard.writeText(value); setToast({ kind: "ok", text: "已复制到剪贴板。" }); }

  function overview() {
    return <>
      <section className="hero-strip"><div><p className="section-kicker">Commercial AI employee</p><h2>从“能回答”升级为“能获客、能转人工、能证明产出”</h2><p>多租户知识库与 RAG 继续作为底座；新增官网客服、销售线索、人工工单、知识缺口和成交金额，让系统具备真正可销售的业务闭环。</p></div><button className="primary-button fit" onClick={() => setActive("客服运营")}>发布官网客服 <span>→</span></button></section>
      <section className="metric-grid"><article><span>当前知识库</span><strong>{activeBase?.name || "加载中"}</strong><small>{knowledgeBases.length} 个隔离知识库</small></article><article><span>向量知识文档</span><strong>{indexedDocs}/{documents.length}</strong><small>{documents.reduce((sum, item) => sum + item.chunkCount, 0)} 个 chunks</small></article><article><span>平台 RAG 服务</span><strong className={generation.configured && embedding.configured ? "good" : "warn"}>{generation.configured && embedding.configured ? (rerank.configured ? "统一托管就绪" : "核心模型就绪") : "平台待配置"}</strong><small>由超级管理员统一维护，企业无需填写密钥</small></article><article><span>Credits / 请求</span><strong>{count(usage.summary.creditsBalance)}</strong><small>{count(usage.summary.requests)} 次 API 请求</small></article></section>
      <section className="workspace-insights"><article className="card workspace-health-card"><div className="card-head compact"><div><p className="section-kicker">Workspace health</p><h2>企业 AI 运行健康度</h2></div><span className={healthScore >= 75 ? "live-badge" : "warn-badge"}>{healthScore >= 75 ? "运行良好" : "仍需完善"}</span></div><div className="health-card-body"><div className="health-ring" style={{ background: `conic-gradient(#7253ea 0 ${healthScore}%, #eceef4 ${healthScore}% 100%)` }}><span><b>{healthScore}</b><small>健康分</small></span></div><div className="health-progress-list"><div><span>知识就绪 <b>{knowledgeReadyRate}%</b></span><i><em style={{ width: `${knowledgeReadyRate}%` }}/></i></div><div><span>模型服务 <b>{modelReadyRate}%</b></span><i><em style={{ width: `${modelReadyRate}%` }}/></i></div><div><span>套餐用量 <b>{requestRate}%</b></span><i><em className="mint" style={{ width: `${requestRate}%` }}/></i></div></div></div></article><article className="card workspace-activity-card"><div className="card-head compact"><div><p className="section-kicker">Recent activity</p><h2>最近调用趋势</h2></div><span className="count-badge">{recentTraceBars.length} traces</span></div>{recentTraceBars.length ? <div className="activity-chart" aria-label="最近调用 Token 用量"><div>{recentTraceBars.map((item) => <i key={item.id} title={`${item.question} · ${item.totalTokens} Tokens`} style={{ height: `${Math.max(14, item.totalTokens / maxTraceTokens * 100)}%` }} className={item.status === "success" ? "success" : item.status === "fallback" ? "fallback" : "error"}/>)}</div><footer><span>更早</span><b>{count(usage.summary.totalTokens)} Tokens</b><span>最近</span></footer></div> : <div className="insight-empty"><b>等待第一条真实调用</b><span>完成一次质量测试或官网客服会话后，这里会显示趋势。</span></div>}<div className="overview-quick-actions"><button onClick={() => setActive("知识库")}>整理知识 <span>→</span></button><button onClick={() => setActive("质量测试")}>验证回答 <span>→</span></button><button onClick={() => setActive("客服运营")}>查看商机 <span>→</span></button></div></article></section>
      <section className="flow-card card"><div className="card-head"><div><p className="section-kicker">Revenue pipeline</p><h2>当前商业闭环</h2></div><span className="live-badge">隔离检索 + 客户转化</span></div><div className="flow-steps six">{[["01", "官网获客", "可嵌入企业网站的客服入口"], ["02", "RAG 回答", "Embedding + Rerank + DeepSeek"], ["03", "线索收集", "公司、联系方式与采购需求"], ["04", "转人工", "未解决问题自动进入工单"], ["05", "销售跟进", "新线索到高意向、成交"], ["06", "收入证明", "解决率、商机与成交金额"]].map(([num, title, desc]) => <div key={num}><span>{num}</span><b>{title}</b><small>{desc}</small></div>)}</div></section>
    </>;
  }

  function documentRow(item: KnowledgeDocument) {
    return <article key={item.id} className={`document-row ${item.builtIn ? "locked" : ""}`} draggable={!item.builtIn} onDragStart={(event) => { if (item.builtIn) return; setDraggedDocumentId(item.id); event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedDocumentId(null)}>
      <div className={`file-type ${item.mimeType.includes("pdf") ? "pdf" : "text"}`}>{documentBadge(item)}</div>
      <div className="document-info"><b>{item.name}</b><p>{count(item.charCount)} 字符 · {item.chunkCount} chunks{item.pageCount ? ` · ${item.pageCount} 页` : ""}</p><span className={`index-state ${item.indexStatus}`}><i /> {item.indexStatus === "indexed" ? "向量索引就绪" : item.indexStatus === "needs_embedding" ? "待配置 Embedding" : item.indexStatus === "failed" ? "索引失败" : "等待索引"}{item.ocrUsed ? " · 已 OCR" : ""}{item.builtIn ? " · 系统资料" : ""}</span></div>
      {!item.builtIn && <div className="row-actions"><select aria-label={`移动 ${item.name} 到分类`} value={item.categoryId || ""} onChange={(event) => void moveDocument(item.id, event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><div><button className="mini-button" onClick={() => reindex(item.id)} disabled={busy === `index-${item.id}`}>重建</button><button className="ghost-danger" onClick={() => removeDocument(item)}>删除</button></div></div>}
    </article>;
  }

  function knowledge() {
    const builtins = documents.filter((item) => item.builtIn);
    return <>
      <section className="card knowledge-toolbar"><div><p className="section-kicker">Tenant knowledge databases</p><h2>租户知识库</h2><p>当前租户只能选择自己的知识库，助手也可独立绑定其中一个。</p></div><div className="kb-selector"><select value={activeKnowledgeBaseId} onChange={(event) => void selectKnowledgeBase(event.target.value)} disabled={busy === "select-kb"}>{knowledgeBases.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.documentCount} 份</option>)}</select><button className="mini-button" onClick={createKnowledgeBase} disabled={!canAdmin}>＋ 新建</button><button className="mini-button" onClick={renameKnowledgeBase} disabled={!canAdmin}>改名</button><button className="ghost-danger bordered" onClick={deleteKnowledgeBase} disabled={!canAdmin || activeBase?.isDefault}>删除</button></div></section>
      <div className="knowledge-layout"><section className="card form-card"><div className="card-head"><div><p className="section-kicker">Ingestion</p><h2>导入到 {activeBase?.name || "知识库"}</h2></div><button className="mini-button" onClick={() => reindex()} disabled={busy === "index-all"}>全部重建</button></div><form className="settings-form" onSubmit={uploadKnowledge}><label>目标分类</label><select value={uploadCategoryId} onChange={(event) => setUploadCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label>识别模式<span>原生 Excel 直接解析；扫描表格图片/PDF 请选择“表格结构化”</span></label><select value={ocrMode} onChange={(event) => setOcrMode(event.target.value as "auto" | "text" | "table")}><option value="auto">智能判断（普通 PDF 优先原文解析）</option><option value="text">强制 OCR：图片 / 扫描 PDF 文字</option><option value="table">表格结构化 OCR：表格图片 / 表格 PDF</option></select><div className="ocr-capability-row"><span><b>IMG</b> 图片 OCR</span><span><b>PDF</b> 逐页 OCR</span><span><b>TABLE</b> 单元格行列</span><span><b>XLSX</b> 原生解析</span></div><label>上传文件<span>PDF、Word、Excel、PPT、图片与文本，最大 12 MB；扫描件自动走已配置 OCR</span></label><label className="upload-zone" htmlFor="knowledge-file"><input id="knowledge-file" type="file" accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,.txt,.md,.csv,.json" onChange={(event) => setFile(event.target.files?.[0] || null)} /><span className="upload-icon">↑</span><b>{file?.name || "选择知识文档"}</b><small>{file ? bytes(file.size) : "原文件进入租户/知识库/分类隔离的 R2 路径"}</small></label><div className="or-line"><span>或者粘贴文本</span></div><label>文档名称</label><input value={pasteName} onChange={(event) => setPasteName(event.target.value)} placeholder="例如：退款与售后政策" /><label>知识内容</label><textarea rows={5} value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="粘贴 FAQ、产品手册或业务规则…" /><button className="primary-button" disabled={busy === "upload" || (!file && !pasteText.trim()) || !uploadCategoryId}>{busy === "upload" ? <><span className="spinner" /> 解析 / OCR / 切片 / 向量化中</> : <>导入知识库 <span>→</span></>}</button></form></section>
        <section className="card category-workspace"><div className="card-head"><div><p className="section-kicker">Drag & organize</p><h2>分类与文档</h2></div><button className="primary-button fit" onClick={createCategory}>＋ 新建分类</button></div><p className="drag-hint">拖动文档到分类卡片即可整理；也可以使用每份文档右侧的分类下拉框。</p>{builtins.length > 0 && <div className="system-docs"><b>系统资料</b>{builtins.map(documentRow)}</div>}<div className="category-board">{categories.map((category) => { const items = documents.filter((item) => !item.builtIn && item.categoryId === category.id); return <section className={`category-column ${draggedDocumentId ? "drag-active" : ""}`} key={category.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => onCategoryDrop(event, category.id)}><header><div><b>{category.name}</b><span>{items.length} 份文档</span></div><div>{!category.isSystem && <button onClick={() => renameCategory(category)} aria-label={`修改分类 ${category.name}`}>✎</button>}{!category.isSystem && canAdmin && <button className="danger" onClick={() => deleteCategory(category)} aria-label={`删除分类 ${category.name}`}>×</button>}</div></header><div className="category-documents">{items.length ? items.map(documentRow) : <div className="category-empty">把文档拖到这里</div>}</div></section>; })}</div></section>
      </div>
    </>;
  }

  function assistantView() {
    return <div className="settings-layout"><section className="card form-card wide"><div className="card-head"><div><p className="section-kicker">Assistant orchestration</p><h2>助手、可靠度与拒答边界</h2></div><span className="live-badge">v{assistant.version}</span></div><form className="settings-form" onSubmit={saveAssistant}><label>绑定知识库<span>客户 API 和正式客服默认检索这里；质量测试页可以临时选择其他知识库</span></label><select value={assistant.knowledgeBaseId} onChange={(event) => setAssistant({ ...assistant, knowledgeBaseId: event.target.value })}>{knowledgeBases.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.documentCount} 份文档</option>)}</select><div className="field-grid"><div><label>助手名称</label><input value={assistant.name} onChange={(event) => setAssistant({ ...assistant, name: event.target.value })} /></div><div><label>OpenAI 模型别名<span>客户端 model 参数使用此值</span></label><input value={assistant.modelAlias} onChange={(event) => setAssistant({ ...assistant, modelAlias: event.target.value })} /></div></div><label>系统提示词<span>定义回答边界、语言、引用规则与拒答策略</span></label><textarea rows={8} value={assistant.systemPrompt} onChange={(event) => setAssistant({ ...assistant, systemPrompt: event.target.value })} /><div className="field-grid"><div><label>Temperature</label><input type="number" min="0" max="1.5" step="0.1" value={assistant.temperature} onChange={(event) => setAssistant({ ...assistant, temperature: Number(event.target.value) })} /></div><div><label>检索 Top K</label><input type="number" min="1" max="8" value={assistant.topK} onChange={(event) => setAssistant({ ...assistant, topK: Number(event.target.value) })} /></div></div><label>最低可靠度阈值<span>低于阈值不调用生成模型、不扣模型 Credits，并进入未解决问题</span></label><input type="number" min="0.3" max="0.95" step="0.01" value={assistant.qualityThreshold} onChange={(event) => setAssistant({ ...assistant, qualityThreshold: Number(event.target.value) })}/><label>无依据拒答文案</label><textarea rows={3} value={assistant.fallbackMessage} onChange={(event) => setAssistant({ ...assistant, fallbackMessage: event.target.value })}/><button className="primary-button" disabled={busy === "assistant"}>{busy === "assistant" ? "发布中…" : "发布新版本"}</button></form></section><aside className="card explainer-card"><p className="section-kicker">Isolation guardrails</p><h2>当前助手数据范围</h2><ol><li><span>1</span>租户：{tenant?.tenant.name || "当前租户"}</li><li><span>2</span>知识库：{assistantBase?.name || "请选择"}</li><li><span>3</span>最低可靠度：{assistant.qualityThreshold.toFixed(2)}</li><li><span>4</span>无依据请求由 Grounding Gate 拒答</li><li><span>5</span>来源、Token、成本、Credits 写入 Trace</li></ol></aside></div>;
  }

  function quality() {
    const qualityBase = knowledgeBases.find((item) => item.id === qualityKnowledgeBaseId) || assistantBase;
    return <><section className="quality-scope-card card"><div><p className="section-kicker">Evaluation data scope</p><h2>选择本次测试使用的知识库</h2><small>只影响质量测试，不会修改助手正式绑定，也不会影响客户正在使用的客服。</small></div><label><span>测试知识库</span><select value={qualityKnowledgeBaseId || assistant.knowledgeBaseId} onChange={(event) => { setQualityKnowledgeBaseId(event.target.value); setResult(null); }}>{knowledgeBases.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.documentCount} 份文档</option>)}</select></label></section><div className="quality-layout"><section className="test-panel card"><div className="card-head"><div><p className="section-kicker">End-to-end playground</p><h2>真实 RAG 质量测试</h2><small className="bound-kb">当前检索：{qualityBase?.name || "请选择知识库"}</small></div><span className="tag">Grounding Gate + Rerank</span></div><form onSubmit={runTest}><label>测试问题</label><textarea rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} /><div className="suggestions">{["扫描 PDF 是怎么处理的？", "客户 API 如何流式调用？", "套餐配额和 Credits 怎么扣？"].map((item) => <button type="button" key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div><button className="primary-button" disabled={busy === "chat" || !qualityKnowledgeBaseId}>{busy === "chat" ? <><span className="spinner" /> 检索、门槛判断并回答</> : <>运行测试 <span>→</span></>}</button></form><div className={result ? "answer-box has-result" : "answer-box"}>{busy === "chat" && <div className="thinking"><span/><span/><span/> 正在执行完整 RAG 链路</div>}{!result && busy !== "chat" && <div className="empty-state"><span className="empty-icon">✦</span><h3>等待一次真实回答</h3><p>低于可靠度阈值时会安全拒答，不调用 DeepSeek。</p></div>}{result?.error && <div className="error-state"><strong>调用未完成</strong><p>{result.error}</p></div>}{result?.answer && <div className="answer-content"><div className="answer-label"><span>{result.grounded ? "AI" : "!"}</span>{result.grounded ? assistant.name : "安全拒答"}</div><p>{result.answer}</p><div className="metrics"><span>模型 <b>{result.model}</b></span><span>可靠度 <b>{result.qualityScore?.toFixed(3)} / {result.threshold?.toFixed(2)}</b></span><span>Token <b>{result.usage?.total_tokens}</b></span><span>Credits <b>{result.credits}</b></span><span>Trace <b>{result.traceId?.slice(-8)}</b></span></div></div>}</div></section><aside className="sources-panel card"><div className="card-head"><div><p className="section-kicker">Hybrid retrieval</p><h2>达到门槛的依据</h2></div><span className="count-badge">{result?.sources?.length || 0} chunks</span></div>{!result?.sources?.length ? <div className="source-empty">没有片段达到 {assistant.qualityThreshold.toFixed(2)} 的最低可靠度时，系统会拒答并记录知识缺口。</div> : <div className="source-list">{result.sources.map((source, index) => <article key={source.chunkId}><div className="source-rank">{index + 1}</div><div><b>{source.document}</b><small>confidence {source.confidenceScore.toFixed(3)} · rerank {source.score.toFixed(3)} · vector {source.vectorScore.toFixed(3)}</small><p>{source.excerpt}…</p></div></article>)}</div>}</aside></div><QualitySuite canAdmin={Boolean(canAdmin)} knowledgeBaseId={qualityKnowledgeBaseId} knowledgeBaseName={qualityBase?.name || "未选择"} onNotice={commercialNotice}/></>;
  }

  function apiKeysView() {
    const curl = `curl ${endpoint}/chat/completions \\\n  -H "Authorization: Bearer $KB_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${assistant.modelAlias}","stream":true,"messages":[{"role":"user","content":"如何退款？"}]}'`;
    return <div className="api-layout"><section className="card form-card"><div className="card-head"><div><p className="section-kicker">Customer credentials</p><h2>创建客户 API Key</h2></div><span className="count-badge">{apiKeys.filter((item) => !item.revokedAt).length}/{activePlan?.apiKeyLimit || 0}</span></div><form className="settings-form" onSubmit={createApiKey}><label>密钥名称</label><input value={keyForm.name} onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })} /><div className="field-grid"><div><label>RPM</label><input type="number" min="1" max="1000" value={keyForm.rpmLimit} onChange={(event) => setKeyForm({ ...keyForm, rpmLimit: Number(event.target.value) })} /></div><div><label>TPM</label><input type="number" min="1000" max="2000000" value={keyForm.tpmLimit} onChange={(event) => setKeyForm({ ...keyForm, tpmLimit: Number(event.target.value) })} /></div></div><label>Scopes</label><div className="scope-grid">{scopeOptions.map((scope) => <label key={scope}><input type="checkbox" checked={keyForm.scopes.includes(scope)} onChange={(event) => setKeyForm({ ...keyForm, scopes: event.target.checked ? [...keyForm.scopes, scope] : keyForm.scopes.filter((item) => item !== scope) })} /> {scope}</label>)}</div><button className="primary-button" disabled={!canAdmin || busy === "key"}>{busy === "key" ? "生成中…" : "生成 API Key"}</button></form>{createdKey && <div className="created-secret"><div><b>只显示一次</b><button onClick={() => setCreatedKey(null)}>×</button></div><code>{createdKey}</code><button className="secondary-button" onClick={() => copy(createdKey)}>复制完整密钥</button></div>}</section><section className="card api-doc-card"><div className="card-head"><div><p className="section-kicker">OpenAI compatible</p><h2>客户端调用入口</h2></div><span className="live-badge">SSE 已启用</span></div><div className="endpoint-box"><span>BASE URL</span><code>{endpoint}</code><button onClick={() => copy(endpoint)}>复制</button></div><pre>{curl}</pre><div className="endpoint-list"><span><b>GET</b> /v1/models</span><span><b>POST</b> /v1/chat/completions</span><span><b>POST</b> /v1/responses</span><span><b>GET</b> /v1/traces/:id</span></div><p className="security-note">当前助手绑定“{assistantBase?.name || "知识库"}”；客户密钥不会跨租户或跨知识库检索。</p></section><section className="card key-list-card"><div className="card-head"><div><p className="section-kicker">Key registry</p><h2>已签发密钥</h2></div></div><div className="key-list">{apiKeys.length === 0 ? <div className="source-empty">创建第一枚客户 API Key 后即可用 OpenAI SDK 调用。</div> : apiKeys.map((item) => <article key={item.id} className={item.revokedAt ? "revoked" : ""}><div><b>{item.name}</b><code>{item.prefix}</code><small>{item.modelAlias} · {item.rpmLimit} RPM · {item.tpmLimit.toLocaleString()} TPM</small></div><div><span>{item.revokedAt ? "已吊销" : item.lastUsedAt ? `上次 ${date(item.lastUsedAt)}` : "尚未使用"}</span>{!item.revokedAt && <button className="ghost-danger" onClick={() => revokeKey(item.id)}>吊销</button>}</div></article>)}</div></section></div>;
  }

  function billingView() {
    return <><section className="tenant-hero card"><div><p className="section-kicker">Enterprise workspace</p><h2>{tenant?.tenant.name || "工作区"}</h2><p>{tenant?.tenant.slug} · 当前角色 {tenant?.currentUser.role} · {knowledgeBases.length} 个隔离知识库</p><button className="secondary-button fit" disabled={Boolean(tenant?.currentUser.platformPreview)} onClick={() => void completeOnboarding()}>{tenant?.currentUser.platformPreview ? "只读预览" : tenant?.tenant.onboardingCompleted ? "修改企业资料" : "完成企业注册"}</button></div><div className="credit-orb"><span>Credits</span><strong>{count(billing?.usage.creditsBalance || 0)}</strong></div></section>
      {!billing?.payment.ready && <section className="commercial-upgrade"><b>支付商户待配置</b><span>生产站不会绕过付款升级。商户号、下单地址和回调密钥现在由平台元后台统一管理。</span>{platformAccess && <a href="/platform">进入支付配置 →</a>}</section>}
      {billing?.payment.ready && <section className="card checkout-channel"><div><p className="section-kicker">Checkout channel</p><h2>选择付款方式</h2><span>仅显示平台超级管理员已经启用并通过校验的渠道。</span></div><div>{billing.payment.channels.filter((item) => item.ready).map((channel) => <label className={paymentProvider === channel.provider ? "active" : ""} key={channel.provider}><input type="radio" name="payment-provider" checked={paymentProvider === channel.provider} onChange={() => setPaymentProvider(channel.provider)}/><i>{channel.provider === "wechat" ? "微" : channel.provider === "alipay" ? "支" : "聚"}</i><span><b>{channel.name}</b><small>{channel.feeRateBps ? `费率 ${(channel.feeRateBps / 100).toFixed(2)}%` : "平台不加收渠道费"}</small></span></label>)}</div>{billing.payment.callbackHttpsReady === false && <small className="checkout-http-note">当前为 HTTP：支付渠道和主动查单可用；正式商用建议后续启用 HTTPS 异步回调。</small>}</section>}
      <section className="plan-grid">{billing?.plans.map((plan) => { const current = plan.code === billing.subscription?.plan.code; const renewable = current && plan.monthlyPriceCents > 0; return <article className={`card plan-card ${current ? "current" : ""}`} key={plan.code}><div><span>{plan.name}</span>{current && <b>当前套餐</b>}</div><h3>{plan.monthlyPriceCents ? `¥${(plan.monthlyPriceCents / 100).toFixed(0)}` : "免费"}<small>/ 月</small></h3><ul><li>{count(plan.requestQuota)} 次请求 / 月</li><li>{count(plan.widgetConversationQuota)} 官网会话 / 月</li><li>{count(plan.leadQuota)} 条销售线索 / 月</li><li>{bytes(plan.storageQuotaBytes)} 知识库</li><li>{plan.apiKeyLimit} API Keys · {plan.memberLimit} 成员</li><li>{count(plan.monthlyCredits)} Credits</li></ul><button className={current ? "secondary-button" : "primary-button"} disabled={(!renewable && current) || !plan.monthlyPriceCents || tenant?.currentUser.role !== "owner" || busy === `plan-${plan.code}`} onClick={() => selectPlan(plan.code)}>{renewable ? "续费一个月" : current ? "使用中" : plan.monthlyPriceCents ? "下单购买" : "免费套餐"}</button></article>; })}</section>
      <section className="card order-ledger"><div className="card-head"><div><p className="section-kicker">Order ledger</p><h2>订单、续费与退款</h2></div><span className="count-badge">{billing?.orders.length || 0} 订单</span></div>{!billing?.orders.length ? <div className="source-empty">尚无订单。套餐只会在验签回调和幂等履约完成后生效。</div> : billing.orders.map((order) => { const refund = billing.refunds.find((item) => item.orderNo === order.orderNo && item.status !== "failed"); return <article key={order.id}><div><b>{order.plan?.name || order.orderNo}</b><small>{order.orderNo} · {order.provider} · {date(order.createdAt)}{refund ? ` · 退款 ${refund.status}` : ""}</small></div><strong>¥{(order.amountCents / 100).toFixed(2)}</strong><span className={`order-${order.status}`}>{order.status}</span>{order.paymentUrl && order.status === "pending" && <button className="secondary-button fit" onClick={() => setCheckoutOrder(order)}>继续付款</button>}{order.status === "fulfilled" && !refund && <button className="ghost-danger" disabled={busy === `refund-${order.orderNo}`} onClick={() => void requestRefund(order.orderNo)}>申请退款</button>}</article>; })}</section>
      {checkoutOrder?.paymentUrl && <PaymentCheckoutModal order={{ ...checkoutOrder, paymentUrl: checkoutOrder.paymentUrl }} onClose={() => setCheckoutOrder(null)} onPaid={() => void paymentCompleted()}/>}
    </>;
  }

  function membersView() {
    const activeMembers = tenant?.members.filter((item) => item.status === "active").length || 0;
    return <><section className="member-hero card"><div><p className="section-kicker">Enterprise access</p><h2>成员账号与企业权限</h2><p>这里仅管理“{tenant?.tenant.name || "当前企业"}”的成员，不会授予平台控制台权限。</p></div><div className="member-capacity"><strong>{activeMembers}</strong><span>/ {activePlan?.memberLimit || 0} 个名额</span></div></section><div className="settings-layout member-page-layout"><section className="card form-card"><div className="card-head"><div><p className="section-kicker">Direct accounts & RBAC</p><h2>直接创建成员账号</h2></div><span className="count-badge">{activeMembers} 人</span></div><form className="settings-form member-create-form" onSubmit={createMember}><div className="field-grid"><div><label>成员姓名</label><input value={memberForm.displayName} onChange={(event) => setMemberForm({ ...memberForm, displayName: event.target.value })} placeholder="张三" required/></div><div><label>登录邮箱</label><input type="email" value={memberForm.email} onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })} placeholder="member@company.com" required/></div></div><div className="field-grid"><div><label>临时密码<span>至少10位并包含字母和数字；首次登录强制修改</span></label><input type="password" autoComplete="new-password" value={memberForm.temporaryPassword} onChange={(event) => setMemberForm({ ...memberForm, temporaryPassword: event.target.value })} required/></div><div><label>企业角色</label><select value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })}><option value="member">普通成员</option><option value="viewer">只读成员</option><option value="admin">企业管理员</option></select></div></div><button className="primary-button" disabled={!canAdmin || busy === "member"}>{busy === "member" ? "正在创建…" : "创建成员账号"}</button></form><div className="member-list expanded">{tenant?.members.map((member) => <article key={member.id} className={member.status !== "active" ? "revoked" : ""}><span className="member-avatar">{(member.displayName || member.email).slice(0, 1).toUpperCase()}</span><div><b>{member.displayName || member.email}</b><small>{member.email} · {member.status === "active" ? member.mustChangePassword ? "等待首次改密" : "账号正常" : "已禁用"} · {member.lastLoginAt ? `登录 ${date(member.lastLoginAt)}` : `创建 ${date(member.createdAt)}`}</small></div>{member.role === "owner" ? <em>企业所有者</em> : member.status === "active" && canAdmin ? <select className="role-select" value={member.role} onChange={(event) => void updateMemberRole(member.id, event.target.value)}><option value="admin">企业管理员</option><option value="member">普通成员</option><option value="viewer">只读成员</option></select> : <em>{member.role}</em>}{canAdmin && member.role !== "owner" && member.status === "active" && <><button className="mini-button" onClick={() => void resetMemberPassword(member.id)}>重置密码</button><button className="ghost-danger" onClick={() => void removeMember(member.id)}>离职禁用</button></>}</article>)}</div></section><aside className="member-side"><section className="card role-card"><p className="section-kicker">Enterprise roles</p><h2>企业角色边界</h2><dl><div><dt>所有者 Owner</dt><dd>账单、成员、全部设置</dd></div><div><dt>管理员 Admin</dt><dd>资料、助手与成员运营</dd></div><div><dt>成员 Member</dt><dd>资料整理与质量测试</dd></div><div><dt>只读 Viewer</dt><dd>查看数据，不能修改</dd></div></dl></section><section className="card identity-note"><span>🔐</span><div><b>每人独立账号密码</b><p>密码只保存 PBKDF2 哈希。管理员可重置临时密码，但无法查看成员原密码；离职禁用后立即失去企业访问权限。</p></div></section></aside></div></>;
  }

  function usageView() {
    return <><section className="metric-grid usage-metrics"><article><span>总请求</span><strong>{count(usage.summary.requests)}</strong><small>{usage.summary.successes} 次生成回答</small></article><article><span>安全拒答</span><strong>{usage.summary.fallbacks}</strong><small>未调用模型、未扣模型 Credits</small></article><article><span>模型/OCR 成本</span><strong>¥{(usage.summary.costCents / 100).toFixed(2)}</strong><small>{count(usage.summary.totalTokens)} Tokens</small></article><article><span>Credits 消耗</span><strong>{count(usage.summary.creditsUsed)}</strong><small>余额 {count(usage.summary.creditsBalance)}</small></article></section><section className="card usage-card"><div className="card-head"><div><p className="section-kicker">Trace ledger</p><h2>最近调用、依据与成本审计</h2></div><span className="count-badge">{usage.traces.length} traces</span></div>{usage.traces.length === 0 ? <div className="source-empty">质量测试或客户 API 调用后，这里会出现完整 Trace。</div> : <div className="trace-table"><div className="trace-row trace-head"><span>时间 / Trace</span><span>问题</span><span>模型</span><span>可靠度</span><span>Token</span><span>成本</span><span>状态</span></div>{usage.traces.map((row) => <div className="trace-row" key={row.id}><span>{date(row.createdAt)}<small>{row.id.slice(-10)}</small></span><span title={row.question}>{row.question}</span><span>{row.model}</span><span>{row.grounded ? row.qualityScore.toFixed(3) : "拒答"}</span><span>{row.totalTokens}</span><span>¥{(row.costMicros / 1_000_000).toFixed(4)}</span><span className={row.status === "success" ? "status-success" : row.status === "fallback" ? "warn-badge" : "status-error"}>{row.status}</span></div>)}</div>}</section></>;
  }

  return <><main className="app-shell enterprise-shell">
    <aside className="sidebar enterprise-sidebar">
      <div className="brand enterprise-brand"><span className="brand-mark enterprise-brand-mark">{enterpriseInitial}</span><span><b title={enterpriseName}>{enterpriseName}</b><small>KnowFlow · 企业 AI 工作台</small></span></div>
      <nav>{navGroups.map((group) => <div className="nav-group" key={group.group}><label>{group.group}</label>{group.items.map(([label, index]) => <button className={active === label ? "nav-item active" : "nav-item"} key={label} onClick={() => { setActive(label); setToast(null); }}><span className="nav-index">{index}</span>{label}</button>)}</div>)}</nav>
      {platformAccess && <a className="console-switch" href="/platform"><span>↗</span><div><b>超级管理员控制台</b><small>租户、套餐、支付与全局权限</small></div></a>}
      <div className="sidebar-foot"><span className="status-dot"/><span title={enterpriseName}>{enterpriseName} · 专属空间</span></div>
    </aside>
    <section className={`workspace ${tenant?.currentUser.platformPreview ? "platform-preview-mode" : ""}`}>
      <header className="topbar enterprise-topbar">
        <div className="enterprise-heading"><p className="eyebrow">ENTERPRISE AI SERVICE CONSOLE</p><div className="enterprise-title-row"><h1 title={enterpriseName}>{enterpriseName}</h1><span>{active}</span></div><small>{tenant?.tenant.slug || "正在载入企业资料"} · {activePlan?.name || "企业专属工作台"}</small></div>
        <div className="top-actions">{Boolean(tenant?.workspaces.length) && <select className="workspace-switcher" value={tenant?.tenant.id || ""} onChange={(event) => void switchWorkspace(event.target.value)} disabled={busy === "workspace"} aria-label="切换企业工作区">{tenant?.workspaces.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role}</option>)}</select>}{canAdmin && <button className="launch-wizard-button" onClick={() => setShowOnboarding(true)}>✦ 开通向导</button>}<span className={`model-pill platform-managed ${generation.configured && embedding.configured ? "" : "not-ready"}`} title="模型服务由平台超级管理员统一配置"><span className="pulse"/>{generation.configured && embedding.configured ? "平台模型已托管" : "平台模型待配置"}</span><div className="user-menu"><span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><div><b>{user.displayName}</b><small>{tenant?.currentUser.role || user.email}</small></div><a href="/account">账号</a><a href={logoutHref}>退出</a></div></div>
      </header>
      {toast && <div className={`toast ${toast.kind}`}><span>{toast.kind === "ok" ? "✓" : "!"}</span>{toast.text}<button onClick={() => setToast(null)}>×</button></div>}
      {tenant?.currentUser.platformPreview && <div className="platform-preview-notice"><b>超级管理员只读预览</b><span>正在查看“{tenant.tenant.name}”企业工作台；可以切换租户，但不会占用企业成员名额，也不能代替企业修改资料或发起付款。</span></div>}
      <div className="page-content">{active === "概览" && overview()}{active === "知识库" && knowledge()}{active === "助手" && assistantView()}{active === "质量测试" && quality()}{active === "API 密钥" && apiKeysView()}{active === "客服运营" && <CommercialPanel canAdmin={Boolean(canAdmin)} members={tenant?.members || []} onNotice={commercialNotice}/>} {active === "成员与权限" && membersView()}{active === "套餐与账单" && billingView()}{active === "用量与成本" && usageView()}{active === "渠道与合规" && <OperationsPanel assistantId={assistant.id} canAdmin={Boolean(canAdmin)} onNotice={commercialNotice}/>}</div>
    </section>
  </main><OnboardingWizard open={showOnboarding} companyName={tenant?.tenant.companyName || tenant?.tenant.name || ""} billingEmail={tenant?.tenant.billingEmail || tenant?.currentUser.email || ""} canAdmin={Boolean(canAdmin)} onClose={() => setShowOnboarding(false)} onCompleted={finishOnboarding}/></>;
}
